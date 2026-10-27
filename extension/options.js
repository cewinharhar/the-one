const form = document.getElementById("setup");
const apiKey = document.getElementById("apiKey");
const about = document.getElementById("about");
const status = document.getElementById("status");

chrome.storage.local.get(["xaiApiKey", "aboutYou"], (data) => {
  if (data.xaiApiKey) apiKey.value = data.xaiApiKey;
  if (data.aboutYou) about.value = data.aboutYou;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  chrome.storage.local.set(
    {
      xaiApiKey: apiKey.value.trim(),
      aboutYou: about.value.trim(),
    },
    () => {
      status.textContent = "Saved.";
    }
  );
});
