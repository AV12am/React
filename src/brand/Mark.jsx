import paths from './mark-paths.json';

// Petal order in mark-paths.json runs clockwise from 12 o'clock.
export function Mark({ size = 32, className = '', title = 'VOLOSHYNSKY' }) {
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
export function Loader({ size = 40, label = 'Завантаження' }) {
  return (
    <span className="vx-loader" style={{ width: size, height: size }} role="status" aria-label={label}>
      <svg viewBox="-100 -100 200 200">
        <g fill="currentColor" fillRule="evenodd">
          {paths.petals.map((d, i) => (
            <path key={i} className="petal" d={d} style={{ animationDelay: `${(i - 8) * 0.15}s` }} />
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
        <div className="vx-wordmark">Voloshynsky</div>
        {tagline && <div className="vx-tagline">Tradecraft for intelligence</div>}
      </div>
    </div>
  );
}
