/**
 * AchievementUnlockPanel — slides up from bottom when a new badge is earned.
 * Queues multiple unlocks and shows them one by one.
 */
import { useEffect, useState } from 'react';
import { BADGE_MAP, type EarnedBadge, type BadgeRarity } from '../../lib/achievementsEngine';

type Props = {
  queue: EarnedBadge[];
  onShift: () => void; // called when front item is dismissed
};

const RARITY_STYLES: Record<BadgeRarity, { bg: string; border: string; glow: string; label: string }> = {
  common:    { bg: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', border: '#16a34a', glow: 'rgba(34,197,94,0.4)', label: 'VANLIG' },
  rare:      { bg: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', border: '#1d4ed8', glow: 'rgba(59,130,246,0.4)', label: 'SJELDEN' },
  epic:      { bg: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', border: '#7c3aed', glow: 'rgba(168,85,247,0.4)', label: 'EPISK' },
  legendary: { bg: 'linear-gradient(135deg, #f97316 0%, #dc2626 100%)', border: '#dc2626', glow: 'rgba(249,115,22,0.5)', label: 'LEGENDARISK' },
};

export default function AchievementUnlockPanel({ queue, onShift }: Props) {
  const [visible, setVisible] = useState(false);

  const current = queue[0];
  const badge = current ? BADGE_MAP.get(current.badgeId) : null;

  useEffect(() => {
    if (!current || !badge) return;

    // Show animation
    const show = setTimeout(() => setVisible(true), 40);
    // Auto-dismiss
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(onShift, 350);
    }, 3800);

    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [current?.badgeId]); // re-run when badge changes

  if (!badge || !current) return null;

  const style = RARITY_STYLES[badge.rarity];

  return (
    <div className={`achievement-panel ${visible ? 'achievement-panel--visible' : ''}`}>
      <div
        className="achievement-panel-inner"
        style={{ background: style.bg, boxShadow: `0 16px 40px ${style.glow}, 0 4px 12px rgba(0,0,0,0.3)` }}
        onClick={() => {
          setVisible(false);
          setTimeout(onShift, 300);
        }}
      >
        {/* Rarity label */}
        <div className="achievement-rarity-label">{style.label}</div>

        {/* Icon */}
        <div className="achievement-icon-wrap">
          <span className="achievement-icon">{badge.icon}</span>
        </div>

        {/* Text */}
        <div className="achievement-text">
          <p className="achievement-header">Prestasjon låst opp!</p>
          <p className="achievement-name">{badge.name}</p>
          <p className="achievement-desc">{badge.description}</p>
        </div>

        {/* Queue indicator */}
        {queue.length > 1 && (
          <div className="achievement-queue-badge">+{queue.length - 1}</div>
        )}

        {/* Time-remaining bar */}
        <div className="achievement-progress" />
      </div>
    </div>
  );
}
