(function () {
  if (document.getElementById("theone-root")) return;
  if (!TheOneLuma.eventSlugFromPath(location.pathname)) return;

  const root = document.createElement("div");
  root.id = "theone-root";
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = chrome.runtime.getURL("card.css");
  shadow.appendChild(style);

  const launch = document.createElement("button");
  launch.className = "launch";
  launch.type = "button";
  launch.textContent = "Find the one";
  shadow.appendChild(launch);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.hidden = true;

  document.documentElement.appendChild(root);

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (!event.data || event.data.source !== "theone-progress") return;
    if (!activeSearch) return;
    activeSearch.guest.textContent = event.data.count + " people so far.";
  });

  launch.addEventListener("click", () => {
    openAsk();
  });

  let activeSearch = null;

  function showSheet() {
    if (!sheet.isConnected) shadow.appendChild(sheet);
    sheet.hidden = false;
  }

  function hideSheet() {
    activeSearch = null;
    sheet.hidden = true;
    sheet.replaceChildren();
    sheet.remove();
  }

  function openAsk() {
    showSheet();
    sheet.replaceChildren(panel(askView()));
  }

  function panel(node) {
    const wrap = document.createElement("div");
    wrap.className = "panel";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "The One");
    const close = document.createElement("button");
    close.className = "close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close");
    close.addEventListener("click", hideSheet);
    wrap.append(close, node);
    return wrap;
  }

  function askView() {
    const view = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "kicker";
    kicker.textContent = "The one";
    const title = document.createElement("h1");
    title.textContent = "Who do you have to meet?";
    const label = document.createElement("label");
    label.htmlFor = "theone-need";
    label.textContent = "Your biggest need right now";
    const field = document.createElement("textarea");
    field.id = "theone-need";
    field.rows = 4;
    const button = document.createElement("button");
    button.className = "go";
    button.type = "button";
    button.textContent = "Find them";
    const setup = document.createElement("button");
    setup.className = "linkish";
    setup.type = "button";
    setup.textContent = "Edit your story and key";
    setup.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-options" });
    });
    button.addEventListener("click", () => {
      run(field.value, button);
    });
    view.append(kicker, title, label, field, button, setup);
    return view;
  }

  async function run(need, button) {
    const trimmed = need.trim();
    if (!trimmed) {
      showError("Say what you need right now.");
      return;
    }
    button.disabled = true;
    const status = await chrome.runtime.sendMessage({ type: "setup-status" });
    if (!status?.hasKey || !status?.hasAbout) {
      showError("Add your xAI key and who you are in the extension options first.");
      return;
    }
    const progress = showSearch();
    const loaded = await chrome.runtime.sendMessage({ type: "load-room" });
    if (!loaded?.ok) {
      showError(loaded?.error || "The guest list could not be read.");
      return;
    }
    const room = loaded.room;
    progress.guest.textContent = room.people.length + " people in the room.";
    progress.grok.textContent = "Choosing the one person.";
    const reply = await chrome.runtime.sendMessage({
      type: "match",
      need: trimmed,
      people: room.people,
    });
    if (!reply?.ok) {
      showError(reply?.error || "Grok could not make the match.");
      return;
    }
    const person = room.people.find((item) => item.id === reply.result.id);
    if (!person) {
      showError("The match did not point at anyone in this room.");
      return;
    }
    showCard(room, person, reply.result);
  }

  function showSearch() {
    const view = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "kicker";
    kicker.textContent = "The one";
    const title = document.createElement("h1");
    title.textContent = "Looking.";
    const guestLabel = document.createElement("p");
    guestLabel.className = "section-label";
    guestLabel.textContent = "Guest list";
    const guest = document.createElement("p");
    guest.className = "step";
    guest.textContent = "Opening the list.";
    const grokLabel = document.createElement("p");
    grokLabel.className = "section-label";
    grokLabel.textContent = "Grok";
    const grok = document.createElement("p");
    grok.className = "step";
    grok.textContent = "Waiting for the room.";
    view.append(kicker, title, guestLabel, guest, grokLabel, grok);
    showSheet();
    sheet.replaceChildren(panel(view));
    activeSearch = { guest, grok };
    return activeSearch;
  }

  function showError(text) {
    activeSearch = null;
    const view = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "kicker";
    kicker.textContent = "The one";
    const title = document.createElement("h1");
    title.textContent = "This room is closed.";
    const copy = document.createElement("p");
    copy.className = "error-copy";
    copy.textContent = text;
    const again = document.createElement("button");
    again.className = "go";
    again.type = "button";
    again.textContent = "Try again";
    again.addEventListener("click", openAsk);
    view.append(kicker, title, copy, again);
    showSheet();
    sheet.replaceChildren(panel(view));
  }

  function showCard(room, person, match) {
    activeSearch = null;
    const view = document.createElement("div");
    const kicker = document.createElement("p");
    kicker.className = "kicker";
    kicker.textContent = room.eventName ? "The one · " + room.eventName : "The one";
    if (person.avatar) {
      const photo = document.createElement("img");
      photo.className = "photo";
      photo.alt = person.name;
      photo.src = person.avatar;
      view.append(photo);
    } else {
      const fallback = document.createElement("div");
      fallback.className = "photo initials";
      fallback.textContent = initials(person.name);
      view.append(fallback);
    }
    view.append(kicker);
    const name = document.createElement("p");
    name.className = "name";
    name.textContent = person.name;
    const whyLabel = document.createElement("p");
    whyLabel.className = "section-label";
    whyLabel.textContent = "Why them";
    const why = document.createElement("p");
    why.className = "why";
    why.textContent = match.why;
    const spotLabel = document.createElement("p");
    spotLabel.className = "section-label";
    spotLabel.textContent = "How to find them";
    const spot = document.createElement("p");
    spot.className = "spot";
    spot.textContent = match.howToSpot;
    view.append(name, whyLabel, why, spotLabel, spot);
    if (person.bio) {
      const bioLabel = document.createElement("p");
      bioLabel.className = "section-label";
      bioLabel.textContent = "Their bio";
      const bio = document.createElement("p");
      bio.className = "spot";
      bio.textContent = person.bio;
      view.append(bioLabel, bio);
    }
    if (person.links.length) {
      const links = document.createElement("div");
      links.className = "links";
      for (const link of person.links) {
        const anchor = document.createElement("a");
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.textContent = link.label;
        links.append(anchor);
      }
      view.append(links);
    }
    showSheet();
    sheet.replaceChildren(panel(view));
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase();
  }
})();
