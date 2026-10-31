// The opening of CONTEXT News while the issue loads: the Reaction mark turns a little, one of its eight pens
// comes loose and, laid at a pen's angle, becomes CONTEXT's nib; then the name is written out — «CONTEXT»,
// and after it «News». About three seconds; a click skips it, and reduced motion shows the last frame at once.
// When the issue is in, the name travels from the centre up to the page's own heading and settles there.
import { useLayoutEffect, useRef, useState } from 'react';
import paths from '../brand/mark-paths.json';
import { NIB } from '../brand/Mark.jsx';

export function NewsIntro({ leaving = false, onSkip }) {
  const art = useRef(null);
  const [move, setMove] = useState(null);
  // Centre → heading: where the lockup sits on screen (the nib's left edge and the name's middle line, its
  // letters 64 units tall) and where the heading's mark and name are; one translate and scale between them.
  useLayoutEffect(() => {
    if (!leaving || !art.current) return;
    const brand = document.querySelector('.news__brand');
    if (!brand) return;
    const a = art.current.getBoundingClientRect();
    const k = a.width / 640;
    const fromX = 112 * k;
    const fromY = 120 * k;
    const b = brand.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(brand).fontSize) || 32;
    const s = size / (64 * k);
    setMove({
      transformOrigin: `${fromX}px ${fromY}px`,
      transform: `translate(${b.left - (a.left + fromX)}px, ${b.top + b.height / 2 - (a.top + fromY)}px) scale(${s})`,
    });
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
        <g className="ni-pen" fill="currentColor" fillRule="evenodd">
          <path className="ni-pen__petal" d={paths.petals[0]} />
          <path className="ni-pen__nib" d={NIB} />
        </g>
        <text className="ni-word ni-word--context" x="208" y="143" textLength="252" lengthAdjust="spacingAndGlyphs">CONTEXT</text>
        <text className="ni-word ni-word--news" x="478" y="143" textLength="128" lengthAdjust="spacingAndGlyphs">News</text>
      </svg>
    </div>
  );
}
