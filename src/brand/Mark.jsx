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

// CONTEXT, the assistant: one pen of the mark — the first petal exactly as it is in the mark, standing alone.
export function ContextMark({ size = 32, className = '', title = 'CONTEXT' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="-37 -96 74 74" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : true}>
      <path d={paths.petals[0]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
