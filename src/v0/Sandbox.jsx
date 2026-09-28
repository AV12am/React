// Dev-only page (#/v0): renders every block from src/v0/blocks inside the real app shell,
// with live store data and the current theme. Not included in production builds.
const blocks = import.meta.glob('./blocks/*.jsx', { eager: true });

export default function Sandbox() {
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <div className="vx-eyebrow">Лише в режимі розробки</div>
          <h1 className="vx-h1">Пісочниця <span className="vx-mono">v0</span></h1>
        </div>
      </header>
      {Object.entries(blocks).map(([path, mod]) => {
        const Block = mod.default;
        const name = path.replace('./blocks/', '').replace('.jsx', '');
        return (
          <section key={path} className="stack">
            <div className="vx-eyebrow">{name}</div>
            {Block ? <Block /> : <div className="vx-hint">Немає default export.</div>}
          </section>
        );
      })}
    </div>
  );
}
