import paths from './mark-paths.json';

// Petal order in mark-paths.json runs clockwise from 12 o'clock.
export function Mark({ size = 32, className = '', title = 'Reaction' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="-100 -100 200 200" role="img" aria-label={title}>
      <g fill="currentColor" fillRule="evenodd">
        {paths.petals.map((d, i) => <path key={i} d={d} />)}
        <path d={paths.core} />
      </g>
    </svg>
  );
}

// Loading indicator: the eight petals light up in turn, clockwise, like a compass sweep.
// `still` freezes one frame of that sweep — a fading trail — for placeholders that are not loading.
export function Loader({ size = 40, label = 'Завантаження', still = false }) {
  return (
    <span className={`vx-loader ${still ? 'vx-loader--still' : ''}`} style={{ width: size, height: size }} role={still ? 'img' : 'status'} aria-label={label}>
      <svg viewBox="-100 -100 200 200">
        <g fill="currentColor" fillRule="evenodd">
          {paths.petals.map((d, i) => (
            <path key={i} className="petal" d={d}
              style={still ? { opacity: 0.18 + (0.82 * (i + 1)) / 8 } : { animationDelay: `${(i - 8) * 0.15}s` }} />
          ))}
          <path className="core" d={paths.core} />
        </g>
      </svg>
    </span>
  );
}

// The large background mark of the sign-in screen: it turns slowly while its outline is drawn
// petal by petal, fills in, holds and fades — then draws itself again.
export function DrawnMark({ size = 720, className = '' }) {
  return (
    <svg className={`drawn-mark ${className}`} width={size} height={size} viewBox="-100 -100 200 200" aria-hidden="true">
      <g className="drawn-mark__spin" fillRule="evenodd">
        {[...paths.petals, paths.core].map((d, i) => (
          <path key={i} d={d} pathLength="1" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </g>
    </svg>
  );
}

export function Wordmark({ tagline = false }) {
  return (
    <div className="brand-lockup">
      <Mark size={28} />
      <div>
        <div className="vx-wordmark">Reaction</div>
        {tagline && <div className="vx-tagline">Tradecraft for intelligence</div>}
      </div>
    </div>
  );
}

// CONTEXT, the assistant: one pen of the mark made into a steel nib — the petal's point, shoulders and diamond slit,
// split down to the point, on a short engraved nib body; laid at the angle of a pen in the hand.
const NIB = 'M0 -96L13.44 -57.6L10.2 -44L10.2 -24L-10.2 -24L-10.2 -44L-13.44 -57.6Z'
  + 'M0 -86.4L0.77 -65.28L3.07 -55.68L0.77 -46.08L0 -40L-0.77 -46.08L-3.07 -55.68L-0.77 -65.28Z'
  + 'M-0.42 -97L0.42 -97L0.42 -86L-0.42 -86Z'
  + 'M-10.4 -33L10.4 -33L10.4 -31.6L-10.4 -31.6Z';
export function ContextMark({ size = 32, className = '', title = 'CONTEXT' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="-41 -101 82 82" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      <path d={NIB} fill="currentColor" fillRule="evenodd" transform="rotate(35 0 -60)" />
    </svg>
  );
}
