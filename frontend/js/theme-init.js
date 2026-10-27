// Applies the saved colour theme before the page is drawn, so a dark choice
// never flashes light. A classic script in <head> (the CSP forbids inline
// scripts); the switch itself is in theme.js.
(function () {
  try {
    var saved = localStorage.getItem('qualimetry-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (e) {
    // Storage blocked: follow the system setting.
  }
}());
