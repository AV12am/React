// SITUATION's entry: small on purpose — the site's styles, header and translator come at once (the page shows in its
// language with the «loading» line), and the dashboards' heavy code (situation-main.jsx) follows on its own.
import './site.css';
import './area.css';
import { reloadOnce } from './chrome.js';

import('./situation-main.jsx').catch(() => {
  // The dashboards' code did not come (an update renamed it, or the network dropped): reload once, else say so.
  if (reloadOnce()) return;
  const boot = document.getElementById('sit-boot');
  if (boot) boot.innerHTML = '<p class="dg-wait">SITUATION did not load. <a class="lnk" href="">Reload the page</a></p>';
});
