# The One

A Chrome extension that finds the one person you should talk to at a Luma event.

You tell it who you are once, and what you need tonight. It reads the guest list you can already see, asks Grok to pick a single person, and shows their face, why they are the one, and how to find them in the room.

## Install

1. Download [the-one.zip](https://github.com/cewinharhar/the-one/releases/download/v0.1.0/the-one.zip).
2. Unzip it. You should see a folder named `the-one` with a `manifest.json` inside.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode** at the top right.
5. Click **Load unpacked** and choose that `the-one` folder.
6. Pin **The One** from the puzzle-piece menu, then click the icon.
7. Paste your [xAI API key](https://console.x.ai/team/default/api-keys) and a short story about who you are. Click **Save**.

The key stays in this browser. It is not in this repository.

Use a normal Chrome window on a computer. Incognito, Guest mode, and iPhone Chrome cannot load it.

## Use it

1. Open a Luma event you were accepted to, while you are signed in.
2. Click **Find the one** at the bottom left.
3. Type the one thing you need right now.
4. Click **Find them**.

You will see two steps while it works:

- **Guest list** counts the people as they are read.
- **Grok** picks one person after the list is in.

The card shows their photo, why they fit, how to spot them, their public bio, and any social links already on their Luma profile.

If the host hid the guest list, or Luma has not marked you as going, the extension stops and says so.

## How it works

The extension does four things:

1. Saves your xAI key and your story in `chrome.storage.local` on your machine.
2. Reads the event's public guest list through the same Luma requests the page already makes. It keeps going until every page of guests is in. There is no cap.
3. Sends one request to `grok-4.7`. The prompt is your story, tonight's need, and each guest's name, short bio, and public links.
4. Shows the one person whose id Grok returned. The photo comes from the list, not from the model.

## What leaves your browser

Grok receives guest names, short bios, and public social or website links, plus what you typed about yourself. It does not receive email addresses or phone numbers. Those fields are not read, even if Luma has them for the host.

Your API key is sent only to `api.x.ai`, as the `Authorization` header on that one call.
