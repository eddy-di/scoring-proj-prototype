// Helper preferences, saved per user in this browser:
// whether helpers are shown at all, and which tips were hidden one by one.

let key = 'qualimetry-help:anonymous';
let state = { on: true, hidden: [] };

function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage blocked: the setting lasts until the page is reloaded.
  }
}

export function loadPrefs(username) {
  key = `qualimetry-help:${username}`;
  state = { on: true, hidden: [] };
  try {
    const raw = localStorage.getItem(key);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch {
    // Use the defaults.
  }
}

export const helpOn = () => state.on;
export const tipHidden = (id) => state.hidden.includes(id);
export const hiddenTipCount = () => state.hidden.length;

export function setHelpOn(on) {
  state.on = on;
  save();
}

export function hideTip(id) {
  if (!state.hidden.includes(id)) state.hidden.push(id);
  save();
}

export function showAllTips() {
  state.hidden = [];
  state.on = true;
  save();
}
