// Line icons, 24px grid, 1.5px stroke, square-ish joins to match the faceted mark.
const P = {
  overview: <><path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" /></>,
  divisions: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>,
  access: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></>,
  vault: <><path d="M3 7h7l2 2h9v11H3z" /><path d="M3 7V4h6l2 3" /></>,
  audit: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7M9 8h3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  logout: <><path d="M14 4H5v16h9" /><path d="M10 12h11M17 8l4 4-4 4" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>,
  download: <><path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v4h16v-4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14" /></>,
  check: <><path d="M4 12l5 5L20 6" /></>,
  close: <><path d="M5 5l14 14M19 5L5 19" /></>,
  plus: <><path d="M12 4v16M4 12h16" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.4 2.2 4 5" /></>,
  file: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /></>,
  folder: <><path d="M3 6h7l2 2h9v12H3z" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.1 6.9C3.6 8.6 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1" /></>,
  chevron: <><path d="M9 6l6 6-6 6" /></>,
  arrowUp: <><path d="M12 19V5M6 11l6-6 6 6" /></>,
  arrowDown: <><path d="M12 5v14M6 13l6 6 6-6" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  danger: <><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v5M12 16v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  idle: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  key: <><circle cx="7.5" cy="12" r="4.5" /><path d="M12 12h10M18 12v4M21 12v3" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  command: <><path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z" /></>,
  signal: <><path d="M4 20v-4M9 20v-8M14 20v-12M19 20V4" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  book: <><path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z" /></>,
  truck: <><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  chart: <><path d="M4 4v16h16" /><path d="M8 15l4-4 3 3 5-6" /></>,
  map: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" /><path d="M16 8V4H4v12h4" /></>,
  minus: <><path d="M4 12h16" /></>,
  target: <><circle cx="12" cy="12" r="7" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
  ruler: <><path d="M3 17L17 3l4 4L7 21z" /><path d="M7 13l2 2M10 10l2 2M13 7l2 2" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2 6M20 5v6h-6" /></>,
};

export function Icon({ name, size, className = '', ...rest }) {
  return (
    <svg
      className={className}
      width={size || 24}
      height={size || 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
