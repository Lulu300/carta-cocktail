// Applies the light theme before the first paint, so a guest who chose it never sees the dark
// page flash. A file rather than an inline script: the CSP allows `script-src 'self'` only.
// Same rules as src/utils/theme.ts (storage key, colors, admin pages left dark): keep them in step.
(function () {
  try {
    var isAdminSide = /^\/(admin|login)(\/|$)/.test(location.pathname);
    if (isAdminSide || localStorage.getItem('theme') !== 'light') return;
    document.documentElement.dataset.theme = 'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#faf7f2');
  } catch (error) {
    // Site data blocked: the page stays dark.
  }
})();
