/**
 * XPFloatLayer — renders floating "+XP" numbers that pop up from the bottom of the screen.
 * Subscribe to the xpNotifier and show an animated label per event.
 */
import { useEffect, useState } from 'react';
import { subscribeXP, type XPEvent } from '../../lib/xpNotifier';

type ActiveFloat = XPEvent & { lane: number };

const MAX_FLOATS = 6;
const LANES = 5; // horizontal lanes to spread floats
const FLOAT_LIFETIME_MS = 1400;

export default function XPFloatLayer() {
  const [floats, setFloats] = useState<ActiveFloat[]>([]);

  useEffect(() => {
    return subscribeXP((event) => {
      const lane = Math.floor(Math.random() * LANES);
      setFloats((prev) => {
        const next = [...prev.slice(-(MAX_FLOATS - 1)), { ...event, lane }];
        return next;
      });

      // Remove after animation completes
      setTimeout(() => {
        setFloats((prev) => prev.filter((f) => f.id !== event.id));
      }, FLOAT_LIFETIME_MS);
    });
  }, []);

  if (floats.length === 0) return null;

  return (
    <div
      className="xp-float-layer"
      aria-hidden="true"
      style={{
        position: 'fixed',
        bottom: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(430px, 100vw)',
        height: '180px',
        pointerEvents: 'none',
        zIndex: 1500,
        overflow: 'visible',
      }}
    >
      {floats.map((f) => {
        const leftPct = 10 + f.lane * 18; // spread across 10%–82%
        return (
          <span
            key={f.id}
            className="xp-float"
            style={{ left: `${leftPct}%` }}
          >
            {f.label}
          </span>
        );
      })}
    </div>
  );
}
