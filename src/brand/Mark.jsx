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

export function Wordmark({ tagline = true }) {
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
