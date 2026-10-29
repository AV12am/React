// The viewer's name, code and the time over a classified document on screen: faint, but on every part of the
// picture — enough to trace a photographed screen, not to get in the way of reading.
import { useStore } from '../store.jsx';
import { LOCALE } from '../lib/locale.js';

export function Watermark({ strong }) {
  const { me } = useStore();
  const stamp = `${me.name} · ${me.code} · ${new Date().toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
  const esc = stamp.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='440' height='220'><text x='0' y='150' transform='rotate(-24 0 150)' font-family='Georgia,serif' font-size='13' fill='${strong ? 'rgba(192,90,105,.13)' : 'rgba(160,160,160,.08)'}'>${esc}</text></svg>`;
  return <div className="watermark" aria-hidden="true" style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")` }} />;
}
