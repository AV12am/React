// Runs in <head> before anything is drawn: when the chosen language is not English, the page stays hidden until
// src/site/i18n.js has put its texts into that language (it removes data-i18n-wait), so English never flashes.
// At most 3 s — then the page shows whatever it has.
(function () {
  var l = null;
  try { l = new URLSearchParams(location.search).get('lang') || localStorage.getItem('reaction-site/lang'); } catch (e) { /* private mode */ }
  if (!l || l === 'en') return;
  var d = document.documentElement;
  d.setAttribute('data-i18n-wait', '');
  d.lang = l;
  var s = document.createElement('style');
  s.textContent = 'html[data-i18n-wait] body{visibility:hidden}';
  document.head.appendChild(s);
  setTimeout(function () { d.removeAttribute('data-i18n-wait'); }, 3000);
})();
