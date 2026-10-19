(function () {
  var modes = { light: true, dark: true, system: true };
  function paint(preference) {
    var dark = preference === 'dark' || (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }
  var preference = 'system';
  try {
    var raw = localStorage.getItem('pagetime-preview-settings');
    var theme = raw ? JSON.parse(raw).theme : '';
    if (modes[theme]) preference = theme;
  } catch (error) {}
  paint(preference);
  var storage = globalThis.chrome && chrome.storage && chrome.storage.local;
  if (!storage || location.protocol.indexOf('-extension:') === -1) return;
  storage.get('settings', function (stored) {
    var theme = stored && stored.settings && stored.settings.theme;
    if (modes[theme]) paint(theme);
  });
})();
