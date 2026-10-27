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
    // Anyone with access to this browser can edit storage: keep only well-formed values.
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (typeof saved?.on === 'boolean') state.on = saved.on;
    if (Array.isArray(saved?.hidden)) state.hidden = saved.hidden.filter((x) => typeof x === 'string').slice(0, 200);
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
