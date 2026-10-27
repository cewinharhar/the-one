// Guest-list rows already carry the same public profile Luma returns from
// /user/profile (name, photo, bio_short, socials). A second fetch per person
// adds no fields, and many guests have no username to look up.
(function () {
  const HEADERS = {
    accept: "application/json",
    "x-luma-client-type": "luma-web",
  };
  const SKIP_SLUGS = new Set([
    "home",
    "discover",
    "signin",
    "signup",
    "create",
    "user",
    "calendar",
    "settings",
    "map",
    "explore",
    "pricing",
    "help",
    "blog",
    "notifications",
    "chat",
  ]);
  // Leave headroom under grok-4.7's 500k context for the reply.
  const MAX_INPUT_TOKENS = 400000;

  function eventSlugFromPath(pathname) {
    const parts = String(pathname || "")
      .split("/")
      .filter(Boolean);
    if (parts[0] === "event" && parts[1]) return parts[1];
    if (parts.length !== 1) return null;
    if (SKIP_SLUGS.has(parts[0])) return null;
    return parts[0];
  }

  function socialUrl(kind, handle) {
    const raw = String(handle || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (kind === "linkedin") {
      return "https://www.linkedin.com/" + raw.replace(/^\/+/, "");
    }
    if (kind === "twitter") return "https://x.com/" + raw.replace(/^@/, "");
    if (kind === "instagram") {
      return "https://instagram.com/" + raw.replace(/^@/, "");
    }
    if (kind === "tiktok") return "https://www.tiktok.com/@" + raw.replace(/^@/, "");
    if (kind === "youtube") {
      return "https://www.youtube.com/@" + raw.replace(/^@/, "");
    }
    if (kind === "website") return "https://" + raw.replace(/^\/+/, "");
    return "";
  }

  function normalizeUser(user) {
    if (!user || !user.api_id || !user.name) return null;
    const links = [];
    const linkedin = socialUrl("linkedin", user.linkedin_handle);
    const twitter = socialUrl("twitter", user.twitter_handle);
    const instagram = socialUrl("instagram", user.instagram_handle);
    const tiktok = socialUrl("tiktok", user.tiktok_handle);
    const youtube = socialUrl("youtube", user.youtube_handle);
    const website = socialUrl("website", user.website);
    if (linkedin) links.push({ label: "LinkedIn", url: linkedin });
    if (twitter) links.push({ label: "X", url: twitter });
    if (instagram) links.push({ label: "Instagram", url: instagram });
    if (tiktok) links.push({ label: "TikTok", url: tiktok });
    if (youtube) links.push({ label: "YouTube", url: youtube });
    if (website) links.push({ label: "Site", url: website });
    return {
      id: user.api_id,
      name: user.name,
      bio: user.bio_short || "",
      avatar: user.avatar_url || "",
      links,
    };
  }

  async function lumaGet(fetchImpl, url) {
    let res;
    try {
      res = await fetchImpl(url, { credentials: "include", headers: HEADERS });
    } catch {
      throw new Error("The guest list could not be reached.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Luma will not show this guest list. Sign in and make sure you were accepted."
      );
    }
    if (!res.ok) throw new Error("The guest list could not be read.");
    return res.json();
  }

  async function resolveEvent(fetchImpl, slugOrId) {
    if (String(slugOrId).startsWith("evt-")) {
      const data = await lumaGet(
        fetchImpl,
        "https://api.luma.com/event/get?event_api_id=" + encodeURIComponent(slugOrId)
      );
      return data;
    }
    const data = await lumaGet(
      fetchImpl,
      "https://api.luma.com/url?url=" + encodeURIComponent(slugOrId)
    );
    if (data.kind && data.kind !== "event") {
      throw new Error("This page is not a Luma event.");
    }
    return data.data || data;
  }

  async function loadRoom({ fetchImpl, pathname, onProgress }) {
    const slug = eventSlugFromPath(pathname);
    if (!slug) throw new Error("This page is not a Luma event.");

    const payload = await resolveEvent(fetchImpl, slug);
    const event = payload.event || {};
    const eventId = event.api_id || payload.api_id;
    if (!eventId || !String(eventId).startsWith("evt-")) {
      throw new Error("This page is not a Luma event.");
    }
    if (event.show_guest_list === false) {
      throw new Error("The host has hidden the guest list.");
    }
    const approval =
      payload.guest_info?.approval_status || payload.guest_data?.approval_status;
    if (approval && approval !== "approved") {
      throw new Error("You are not marked as going, so this guest list stays closed.");
    }

    const people = [];
    const seen = new Set();
    let cursor = null;
    let guard = 0;
    do {
      const query = new URL("https://api.luma.com/event/get-guest-list");
      query.searchParams.set("event_api_id", eventId);
      query.searchParams.set("pagination_limit", "100");
      if (cursor) query.searchParams.set("pagination_cursor", cursor);
      const page = await lumaGet(fetchImpl, query.toString());
      for (const entry of page.entries || []) {
        const person = normalizeUser(entry.user);
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        people.push(person);
      }
      if (onProgress) onProgress(people.length);
      cursor = page.has_more ? page.next_cursor || null : null;
      guard += 1;
    } while (cursor && guard < 100);

    if (!people.length) {
      throw new Error("The guest list is empty, so there is no one to match.");
    }
    return {
      eventId,
      eventName: event.name || "",
      people,
    };
  }

  function guestLine(person) {
    const links = (person.links || []).map((link) => link.url).join(" ");
    return [person.id, person.name, person.bio || "", links].join("\t");
  }

  function buildPrompt({ about, need, people }) {
    const lines = people.map(guestLine).join("\n");
    const user =
      "Seeker:\n" +
      about.trim() +
      "\n\nBiggest need right now:\n" +
      need.trim() +
      "\n\nGuests, one per line. Fields are separated by tabs: id, name, bio, links.\n" +
      lines;
    const estimatedTokens = Math.ceil((user.length + 800) / 4);
    if (estimatedTokens > MAX_INPUT_TOKENS) {
      throw new Error(
        "This room is too big to judge in one pass, so no one was picked."
      );
    }
    return user;
  }

  function parseMatch(content) {
    const text = String(content || "")
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Grok did not return a person.");
    }
    if (!parsed || typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("Grok did not return a person.");
    }
    return {
      id: parsed.id,
      why: String(parsed.why || "").trim(),
      howToSpot: String(parsed.how_to_spot || "").trim(),
    };
  }

  globalThis.TheOneLuma = {
    eventSlugFromPath,
    normalizeUser,
    loadRoom,
    buildPrompt,
    parseMatch,
    guestLine,
  };
})();
