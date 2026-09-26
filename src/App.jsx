import { useEffect, useState } from 'react';

const EMOJIS = ['🐶', '🐱', '🦊', '🐼', '🐸', '🐵', '🦁', '🐙'];

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createDeck() {
  return shuffle([...EMOJIS, ...EMOJIS]).map((emoji, id) => ({
    id,
    emoji,
    matched: false,
  }));
}

export default function App() {
  const [cards, setCards] = useState(createDeck);
  const [flipped, setFlipped] = useState([]);
  const [moves, setMoves] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);

  const won = cards.every((card) => card.matched);

  useEffect(() => {
    if (!started || won) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [started, won]);

  useEffect(() => {
    if (flipped.length !== 2) return;
    const [a, b] = flipped;
    if (cards[a].emoji === cards[b].emoji) {
      setCards((prev) =>
        prev.map((card, i) => (i === a || i === b ? { ...card, matched: true } : card))
      );
      setFlipped([]);
      return;
    }
    const timeout = setTimeout(() => setFlipped([]), 800);
    return () => clearTimeout(timeout);
  }, [flipped, cards]);

  function handleClick(index) {
    if (flipped.length === 2 || flipped.includes(index) || cards[index].matched) return;
    setStarted(true);
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length === 2) setMoves((m) => m + 1);
  }

  function restart() {
    setCards(createDeck());
    setFlipped([]);
    setMoves(0);
    setSeconds(0);
    setStarted(false);
  }

  return (
    <main className="game">
      <h1>Знайди пару</h1>
      <div className="stats">
        <span>Ходи: {moves}</span>
        <span>Час: {seconds} с</span>
        <button onClick={restart}>Нова гра</button>
      </div>

      <div className="board">
        {cards.map((card, index) => {
          const isOpen = card.matched || flipped.includes(index);
          return (
            <button
              key={card.id}
              className={`card${isOpen ? ' open' : ''}${card.matched ? ' matched' : ''}`}
              onClick={() => handleClick(index)}
              aria-label={isOpen ? card.emoji : 'Закрита картка'}
            >
              <span className="face">{isOpen ? card.emoji : '?'}</span>
            </button>
          );
        })}
      </div>

      {won && (
        <div className="win">
          🎉 Перемога! {moves} ходів за {seconds} с.
          <button onClick={restart}>Грати ще</button>
        </div>
      )}
    </main>
  );
}
