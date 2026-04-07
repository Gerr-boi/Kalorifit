/**
 * LevelUpOverlay — full-screen celebration when the user gains a level.
 * Shows for 3 seconds then auto-dismisses (or tap to dismiss).
 */
import { useEffect, useState } from 'react';

type Props = {
  level: number;
  label: string;
  onDismiss: () => void;
};

const CONFETTI_COUNT = 56;

const CONFETTI_COLORS = [
  '#f97316', '#fb923c', '#fbbf24', '#34d399',
  '#60a5fa', '#a78bfa', '#f472b6', '#fff',
  '#e879f9', '#38bdf8', '#4ade80',
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function LevelUpOverlay({ level, label, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = setTimeout(() => setVisible(true), 30);
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 400);
    }, 3800);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [onDismiss]);

  const confetti = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const left = randomBetween(1, 99);
    const delay = randomBetween(0, 1.1);
    const duration = randomBetween(1.6, 2.8);
    const size = randomBetween(6, 16);
    const rotate = randomBetween(0, 360);
    const isCircle = i % 3 === 0;
    return { color, left, delay, duration, size, rotate, isCircle };
  });

  return (
    <div
      className={`levelup-overlay ${visible ? 'levelup-overlay--visible' : ''}`}
      onClick={() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }}
      aria-live="assertive"
    >
      {/* Confetti */}
      <div className="levelup-confetti" aria-hidden="true">
        {confetti.map((c, i) => (
          <div
            key={i}
            className={`levelup-confetti-piece levelup-confetti-piece--${c.isCircle ? 'circle' : 'rect'}`}
            style={{
              left: `${c.left}%`,
              backgroundColor: c.color,
              width: `${c.size}px`,
              height: c.isCircle ? `${c.size}px` : `${c.size * 0.55}px`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
              transform: `rotate(${c.rotate}deg)`,
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div className="levelup-card">
        <div className="levelup-badge-ring">
          <span className="levelup-badge-emoji">⭐</span>
        </div>
        <p className="levelup-sub">LEVEL UP!</p>
        <h2 className="levelup-number">Nivå {level}</h2>
        <p className="levelup-label">{label}</p>
        <p className="levelup-hint">Trykk for å fortsette</p>
      </div>
    </div>
  );
}
