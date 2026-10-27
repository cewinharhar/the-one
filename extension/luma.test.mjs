import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadLuma() {
  const sandbox = { console, URL, URLSearchParams };
  vm.runInNewContext(
    fs.readFileSync(new URL("./luma.js", import.meta.url), "utf8"),
    sandbox
  );
  return sandbox.TheOneLuma;
}

const api = loadLuma();

test("event paths", () => {
  assert.equal(api.eventSlugFromPath("/mj5bmugc"), "mj5bmugc");
  assert.equal(api.eventSlugFromPath("/event/evt-abc"), "evt-abc");
  assert.equal(api.eventSlugFromPath("/home"), null);
  assert.equal(api.eventSlugFromPath("/user/jane"), null);
  assert.equal(api.eventSlugFromPath("/"), null);
});

test("profile keeps public fields and drops anything else", () => {
  const person = api.normalizeUser({
    api_id: "usr-1",
    name: "Ada Lovelace",
    bio_short: "Analytical engines",
    avatar_url: "https://images.example/a.jpg",
    linkedin_handle: "/in/ada",
    twitter_handle: "ada",
    website: "ada.dev",
    email: "ada@example.com",
    phone_number: "+15555550100",
  });
  assert.equal(person.id, "usr-1");
  assert.equal(person.links[0].url, "https://www.linkedin.com/in/ada");
  assert.equal(person.links[1].url, "https://x.com/ada");
  assert.equal(person.links[2].url, "https://ada.dev");
  assert.equal("email" in person, false);
  assert.equal(JSON.stringify(person).includes("ada@example.com"), false);
  assert.equal(api.normalizeUser({ api_id: "usr-2" }), null);
});

test("guest list pages all the way through and stops when hidden", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname === "/url") {
      return json({
        kind: "event",
        data: {
          event: { api_id: "evt-1", name: "Meetup", show_guest_list: true },
          guest_info: { approval_status: "approved" },
        },
      });
    }
    const cursor = parsed.searchParams.get("pagination_cursor");
    if (!cursor) {
      return json({
        has_more: true,
        next_cursor: "page-2",
        entries: [
          { user: { api_id: "usr-1", name: "Ada Lovelace", bio_short: "Engines" } },
          { user: { api_id: "usr-1", name: "Ada Lovelace", bio_short: "Engines" } },
        ],
      });
    }
    return json({
      has_more: false,
      entries: [{ user: { api_id: "usr-2", name: "Grace Hopper", bio_short: "Compilers" } }],
    });
  };
  const counts = [];
  const room = await api.loadRoom({
    fetchImpl,
    pathname: "/mj5bmugc",
    onProgress: (count) => counts.push(count),
  });
  assert.equal(
    JSON.stringify(room.people.map((person) => person.id)),
    JSON.stringify(["usr-1", "usr-2"])
  );
  assert.deepEqual(counts, [1, 2]);
  assert.equal(room.eventName, "Meetup");

  const hidden = async (url) => {
    if (String(url).includes("/url")) {
      return json({
        kind: "event",
        data: { event: { api_id: "evt-1", show_guest_list: false } },
      });
    }
    throw new Error("should not page");
  };
  await assert.rejects(
    () => api.loadRoom({ fetchImpl: hidden, pathname: "/secret" }),
    /hidden the guest list/
  );
});

test("one prompt holds every guest and refuses a room that cannot fit", () => {
  const people = [
    { id: "usr-1", name: "Ada", bio: "Engines", links: [] },
    { id: "usr-2", name: "Grace", bio: "", links: [{ url: "https://x.com/grace" }] },
  ];
  const prompt = api.buildPrompt({
    about: "I build compilers.",
    need: "A hardware partner",
    people,
  });
  assert.match(prompt, /usr-1/);
  assert.match(prompt, /usr-2/);
  assert.equal(prompt.includes("@"), false);
  assert.throws(
    () =>
      api.buildPrompt({
        about: "me",
        need: "help",
        people: [{ id: "usr-9", name: "X", bio: "y".repeat(2_000_000), links: [] }],
      }),
    /too big/
  );
});

test("parse the single match", () => {
  const match = api.parseMatch(
    '{"id":"usr-1","why":"Because.","how_to_spot":"Ask about engines."}'
  );
  assert.equal(match.id, "usr-1");
  assert.equal(match.howToSpot, "Ask about engines.");
  assert.throws(() => api.parseMatch("nope"), /did not return a person/);
});

function json(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}
