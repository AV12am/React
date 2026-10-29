// «Доступна нова версія»: every few minutes (and when the app comes back to the screen) the page asks the
// server for its start page and compares the script it names with the one running here. After a release an
// open tab — or an app on the home screen kept in memory — offers to reload instead of running old code.
import { useEffect, useState } from 'react';
import { Icon } from './Icon.jsx';

const mine = () => [...document.scripts].map((s) => s.src).find((s) => /\/assets\/index-[\w-]+\.js/.test(s))?.match(/index-[\w-]+\.js/)?.[0];

export function NewVersion() {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const now = mine();
    if (!now) return undefined; // development: no built assets
    const check = async () => {
      try {
        const html = await (await fetch(new URL('./', document.baseURI), { cache: 'no-store' })).text();
        const live = html.match(/index-[\w-]+\.js/)?.[0];
        if (live && live !== now) setFresh(true);
      } catch { /* offline */ }
    };
    const t = setInterval(check, 5 * 60000);
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    check();
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);
  if (!fresh) return null;
  return (
    <div className="newver" role="status">
      <Icon name="refresh" size={16} /> <span>Доступна нова версія платформи</span>
      <button className="vx-btn vx-btn--primary vx-btn--sm" onClick={() => location.reload()}>Оновити</button>
    </div>
  );
}
