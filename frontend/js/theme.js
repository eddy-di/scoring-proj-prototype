// Colour theme: auto (follow the system), light or dark. Saved in this
// browser for everyone who uses it, including the sign-in page.
// css/app.css reads html[data-theme]; theme-init.js applies it on load.

const KEY = 'qualimetry-theme';
export const THEMES = ['auto', 'light', 'dark'];

export function theme() {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'auto';
}

export function setTheme(value) {
  if (!THEMES.includes(value)) return;
  if (value === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  try {
    if (value === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
}
