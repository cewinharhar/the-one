importScripts("luma.js");

const MODEL = "grok-4.7";
const MATCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      description: "Guest id copied character for character from the list",
    },
    why: {
      type: "string",
      description: "Why this is the one person to talk to tonight",
    },
    how_to_spot: {
      type: "string",
      description: "How to recognize them in the room and what to say first",
    },
  },
  required: ["id", "why", "how_to_spot"],
};

const SYSTEM = [
  "You match a person to exactly one guest at a live event.",
  "Copy one id from the list. Do not invent an id.",
  "Use only the seeker's story, the need they named, and the guest lines.",
  "Do not invent jobs, companies, or facts that are not in a guest line.",
  "If the seeker's own name is clear in their story and matches a guest, pick someone else.",
  "why is three or four sentences they can read on a phone while looking across the room.",
  "how_to_spot is one or two sentences on how to recognize that person and what to say first.",
].join(" ");

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "open-options") {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (message.type === "setup-status") {
    chrome.storage.local.get(["xaiApiKey", "aboutYou"], (data) => {
      sendResponse({
        hasKey: Boolean(data.xaiApiKey),
        hasAbout: Boolean(data.aboutYou && data.aboutYou.trim()),
      });
    });
    return true;
  }
  if (message.type === "load-room") {
    loadRoomFromTab(sender.tab?.id)
      .then((room) => sendResponse({ ok: true, room }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message.type === "match") {
    matchPerson(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});

async function loadRoomFromTab(tabId) {
  if (!tabId) throw new Error("Open a Luma event page first.");
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["luma.js"],
  });
  const [injected] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async () => {
      try {
        const room = await globalThis.TheOneLuma.loadRoom({
          fetchImpl: window.fetch.bind(window),
          pathname: location.pathname,
          onProgress(count) {
            window.postMessage(
              { source: "theone-progress", count: count },
              window.location.origin
            );
          },
        });
        return { ok: true, room };
      } catch (error) {
        return {
          ok: false,
          error: error && error.message ? error.message : "The guest list could not be read.",
        };
      }
    },
  });
  if (!injected?.result?.ok) {
    throw new Error(injected?.result?.error || "The guest list could not be read.");
  }
  return injected.result.room;
}

async function matchPerson(message) {
  const stored = await chrome.storage.local.get(["xaiApiKey", "aboutYou"]);
  const apiKey = (stored.xaiApiKey || "").trim();
  const about = (stored.aboutYou || "").trim();
  const need = (message.need || "").trim();
  const people = Array.isArray(message.people) ? message.people : [];
  if (!apiKey) throw new Error("Add your xAI key in the extension options.");
  if (!about) throw new Error("Add who you are in the extension options.");
  if (!need) throw new Error("Say what you need right now.");
  if (!people.length) throw new Error("The guest list is empty, so there is no one to match.");

  const prompt = TheOneLuma.buildPrompt({ about, need, people });
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "the_one",
          strict: true,
          schema: MATCH_SCHEMA,
        },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.error?.message || body.error || "Grok could not make the match.";
    throw new Error(typeof detail === "string" ? detail : "Grok could not make the match.");
  }
  const content = body.choices?.[0]?.message?.content;
  const match = TheOneLuma.parseMatch(content);
  if (!people.some((person) => person.id === match.id)) {
    throw new Error("The match did not point at anyone in this room.");
  }
  return match;
}
