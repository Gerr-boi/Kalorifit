import { useEffect, useRef, useState } from 'react';

type Slot = { ch: string; rollKey: number; isDigit: boolean };

type Props = {
  value: number;
  format: (n: number) => string;
  className?: string;
};

/**
 * Renders a number as individual digit slots.
 * When a digit changes (driven by parent's RAF count-up), the slot remounts
 * and the CSS `digit-roll-char` animation plays — giving an odometer/slot-machine feel.
 */
export default function RollingNumber({ value, format, className }: Props) {
  const formatted = format(value);
  const prevFormattedRef = useRef(formatted);
  const keyCounters = useRef(new Array(24).fill(0));
  const [slots, setSlots] = useState<Slot[]>(() =>
    formatted.split('').map((ch) => ({ ch, rollKey: 0, isDigit: /\d/.test(ch) })),
  );

  useEffect(() => {
    const prev = prevFormattedRef.current;
    prevFormattedRef.current = formatted;
    if (formatted === prev) return;

    setSlots(
      formatted.split('').map((ch, i) => {
        if (/\d/.test(ch) && ch !== (prev[i] ?? '')) {
          keyCounters.current[i] = (keyCounters.current[i] || 0) + 1;
        }
        return { ch, rollKey: keyCounters.current[i] || 0, isDigit: /\d/.test(ch) };
      }),
    );
  }, [formatted]);

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      {slots.map(({ ch, rollKey, isDigit }, i) =>
        isDigit ? (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', lineHeight: 'inherit' }}>
            <span key={rollKey} className="digit-roll-char" style={{ display: 'block' }}>
              {ch}
            </span>
          </span>
        ) : (
          <span key={i} style={{ display: 'inline-block' }}>
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
