# AGENTS.md

Hackathon project for the Grok Bot meetup in Toronto (800 Bay, 26 Oct 2026). The prompt is **build something that tells your story**.

This file is the project brief. Read it before writing code. When `.planning/STATE.md` exists, read that next and follow the current phase. Do not start implementation until the user says to build.

## Product

**The One.** A Chrome extension for a young person or founder who is already accepted to a Luma event and needs the one person in that room they have to talk to.

It tells a short story: given who you are and the one thing you need right now, here is the single attendee you should find, why they are the one, and what they look like so you can walk up to them.

### User journey

1. **One-time setup.** The person enters an xAI API key and who they are: life, startup, current issues, biggest needs.
2. **On the event page.** They open a Luma event they were accepted to. The only input is: what is your biggest need right now?
3. **Read the room.** The extension programmatically opens attendee profiles and extracts each person's name, photo, bio, and contact or social fields that profile already shows.
4. **One reasoning call.** A single Grok request picks exactly one person.
5. **The hunt card.** The extension shows that person's face, profile, and why they are the one.

There is no second-place list. One result.

## Locked decisions

- Chrome extension, Manifest V3, unpacked. Chrome first. No backend.
- The xAI key stays in `chrome.storage.local`. Never hardcode it and never commit it. The extension calls `https://api.x.ai/v1` with `XAI_API_KEY`. Provider name in copy is SpaceXAI. Model to prefer is `grok-4.7` unless the current docs at https://docs.x.ai name a better fit. Fetch those docs before writing the request. Do not invent model ids.
- One model call per run, and that call must reason. Do not fan out into a ranker plus a writer.
- Read every attendee. No person cap. Pagination is required. Do not stop at the first screen of guests.
- Open profiles programmatically through the same requests the logged-in Luma page uses. Do not click through the guest list in the UI.
- If the guest list or profiles cannot be read, stop and show a clear not-possible message. Do not ship a demo room, sample attendees, or a fallback cast. The event we will use does expose the list: https://luma.com/mj5bmugc
- Only fields an accepted guest can already see by opening profiles. Name, photo, bio, and social or contact links present on that profile. Do not call host-only APIs to collect emails or phone numbers the guest list does not show.
- Quick and dirty. The smallest extension that completes the journey. No accounts, no sync, no extra settings.
- The result has to be usable on a phone. Prefer the easiest surface that still works in a narrow viewport: a mobile-first card with a large face, the name, and the reason. iPhone Safari and iPhone Chrome cannot load this extension. Treat that as an open problem in the plan, not as permission to ignore the phone.

## Non-goals

- A ranked list, chat, or "people like you" grid.
- Scraping events the user cannot already open while logged in and accepted.
- A Chrome Web Store listing, a server, or a key proxy.
- Reading `template_projects/` until the user says the clone has finished. That tree is reference material, not this product. A partial clone is not a source of truth.

## Repo shape

The extension lives in `extension/`. Load that folder unpacked at `chrome://extensions`. `template_projects/` is reference only. Do not edit it.

```text
AGENTS.md
extension/          # Manifest V3 extension. luma.js, content.js, background.js, options page.
template_projects/  # Cloned references. Do not modify.
```

Guest rows from `https://api.luma.com/event/get-guest-list` already include the public profile (name, photo, `bio_short`, socials). Do not add a second profile request per person. Paginate with `next_cursor` until `has_more` is false. The signed-in check event is https://luma.com/mj5bmugc (`evt-eO08FHgk6HTqIQW`). Fetches run in the page's main world so they use the attendee's Luma session. The one Grok call is `POST https://api.x.ai/v1/chat/completions` with model `grok-4.7` and a strict JSON schema.

Screenshots and browser artifacts go in `.playwright/`, never in the repo root.

## How to work

- Hackathon pace. Ship the journey, then stop.
- Confirm Luma's live request and response with Playwright before freezing the extractor. Third-party notes about `api.lu.ma` are hints, not a contract.
- Verify the setup, the not-possible state, and the hunt card in a browser once Playwright is available. A static screenshot of the card is not enough.
- Do not mark a phase done in `.planning/STATE.md` until its checks have actually been run.
- Preserve unrelated files. Do not commit secrets.
