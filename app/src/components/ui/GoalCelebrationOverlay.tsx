import { useEffect, useState } from 'react';

type Props = {
  emoji: string;
  title: string;
  subtitle: string;
  onDismiss: () => void;
};

const PIECE_COUNT = 52;
const COLORS = [
  '#3b82f6', '#60a5fa', '#93c5fd',
  '#34d399', '#6ee7b7',
  '#fbbf24', '#f97316',
  '#a78bfa', '#f472b6',
  '#fff', '#38bdf8',
];

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export default function GoalCelebrationOverlay({ emoji, title, subtitle, onDismiss }: Props) {
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

  const pieces = Array.from({ length: PIECE_COUNT }, (_, i) => ({
    color: COLORS[i % COLORS.length],
    left: rnd(2, 98),
    delay: rnd(0, 0.9),
    duration: rnd(1.5, 2.6),
    size: rnd(6, 15),
    drift: rnd(-70, 70),
    rotate: rnd(200, 560),
    isCircle: i % 3 === 0,
  }));

  return (
    <div
      className={`goal-celebration-overlay${visible ? ' goal-celebration-overlay--visible' : ''}`}
      onClick={() => {
        setVisible(false);
        setTimeout(onDismiss, 300);
      }}
      aria-live="assertive"
    >
      <div className="goal-celebration-confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <div
            key={i}
            className="goal-confetti-piece"
            style={{
              left: `${p.left}%`,
              backgroundColor: p.color,
              width: `${p.size}px`,
              height: p.isCircle ? `${p.size}px` : `${p.size * 0.5}px`,
              borderRadius: p.isCircle ? '50%' : '2px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--rotate': `${p.rotate}deg`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="goal-celebration-card">
        <div className="goal-celebration-emoji">{emoji}</div>
        <p className="goal-celebration-title">{title}</p>
        <p className="goal-celebration-subtitle">{subtitle}</p>
        <p className="goal-celebration-hint">Trykk for å lukke</p>
      </div>
    </div>
  );
}
