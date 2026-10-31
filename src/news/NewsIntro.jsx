// The opening of CONTEXT News while the issue loads: the Reaction mark turns a little, one of its eight pens
// comes loose and, laid at a pen's angle, becomes CONTEXT's nib; then the name is written out — «CONTEXT»,
// and after it «News». About three seconds; a click skips it, and reduced motion shows the last frame at once.
// When the issue is in, the name travels from the centre up to the page's own heading and settles there.
import { useLayoutEffect, useRef, useState } from 'react';
import paths from '../brand/mark-paths.json';
import { NIB } from '../brand/Mark.jsx';

export function NewsIntro({ leaving = false, onSkip }) {
  const art = useRef(null);
  const word = useRef(null);
  const [move, setMove] = useState(null);
  // «News» follows «CONTEXT» at its natural width (the letters keep their own proportions), once the font is in.
  const [newsX, setNewsX] = useState(425);
  useLayoutEffect(() => {
    const place = () => { try { const w = word.current?.getComputedTextLength(); if (w) setNewsX(133 + w + 22); } catch { /* keep the default */ } };
    place();
    document.fonts?.ready?.then(place).catch(() => {});
  }, []);
  // Centre → heading. The whole lockup is carried so that «CONTEXT» lands exactly on the heading's «CONTEXT»;
  // then the nib and «News» are each set right onto the heading's own mark and «News» (the heading is laid out
  // a little differently from the opening), so when the opening steps aside nothing jumps.
  const pen = useRef(null);
  const news = useRef(null);
  const [fix, setFix] = useState({});
  useLayoutEffect(() => {
    if (!leaving || !art.current) return;
    const brand = document.querySelector('.news__brand');
    const textNode = brand && [...brand.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const mark = brand?.querySelector('svg path');
    const em = brand?.querySelector('em');
    if (!brand || !textNode || !mark || !em || !word.current || !pen.current || !news.current) return;
    const range = document.createRange();
    const from = textNode.textContent.indexOf('C');
    range.setStart(textNode, Math.max(0, from)); range.setEnd(textNode, Math.max(0, from) + 7);
    const T = range.getBoundingClientRect();
    const a = art.current.getBoundingClientRect();
    const k = a.width / 640;
    const W = word.current.getBoundingClientRect();
    const s = T.width / W.width;
    const tx = T.left - (a.left + s * (W.left - a.left));
    const ty = T.top + T.height / 2 - (a.top + s * (W.top + W.height / 2 - a.top));
    // A piece of the opening (its box now, on screen) set onto a box of the heading: in the drawing's own units.
    const onto = (now, to) => {
      const cx = (now.left + now.width / 2 - a.left) / k;
      const cy = (now.top + now.height / 2 - a.top) / k;
      const p = to.height / (now.height * s);
      const landX = a.left + s * (now.left + now.width / 2 - a.left) + tx; // where its centre would land
      const landY = a.top + s * (now.top + now.height / 2 - a.top) + ty;
      const dx = (to.left + to.width / 2 - landX) / (s * k);
      const dy = (to.top + to.height / 2 - landY) / (s * k);
      return { transform: `translate(${dx}px, ${dy}px) translate(${cx}px, ${cy}px) scale(${p}) translate(${-cx}px, ${-cy}px)` };
    };
    setFix({ pen: onto(pen.current.getBoundingClientRect(), mark.getBoundingClientRect()), news: onto(news.current.getBoundingClientRect(), em.getBoundingClientRect()) });
    setMove({ transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${s})` });
  }, [leaving]);
  return (
    <div className={`news-intro ${leaving ? 'is-leaving' : ''}`} role="status" aria-label="CONTEXT News — завантаження" onClick={onSkip}>
      <svg ref={art} className="news-intro__art" style={move || undefined} viewBox="0 0 640 240" aria-hidden="true">
        {/* The rest of the mark: turns, then falls away. */}
        <g className="ni-flower">
          <g fill="currentColor" fillRule="evenodd">
            {paths.petals.slice(1).map((d, i) => <path key={i} d={d} />)}
            <path d={paths.core} />
          </g>
        </g>
        {/* The pen that comes loose: a petal of the mark, then CONTEXT's nib. */}
        <g className="ni-settle ni-settle--pen" style={fix.pen}>
          <g className="ni-pen" fill="currentColor" fillRule="evenodd">
            <path className="ni-pen__petal" d={paths.petals[0]} />
            <path ref={pen} className="ni-pen__nib" d={NIB} />
          </g>
        </g>
        <text ref={word} className="ni-word ni-word--context" x="133" y="143">CONTEXT</text>
        <g className="ni-settle" style={fix.news}>
          <text ref={news} className="ni-word ni-word--news" x={newsX} y="143">News</text>
        </g>
      </svg>
    </div>
  );
}
