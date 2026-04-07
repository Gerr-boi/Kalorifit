/**
 * Lightweight pub/sub for XP gain events.
 * Components call notifyXP() to fire; XPFloatLayer subscribes to render floats.
 */

export type XPEvent = {
  id: string;
  amount: number;
  label: string;
};

type Listener = (event: XPEvent) => void;
const listeners: Set<Listener> = new Set();

let _seq = 0;

export function notifyXP(amount: number, label?: string) {
  _seq += 1;
  const event: XPEvent = {
    id: `xp-${Date.now()}-${_seq}`,
    amount,
    label: label ?? `+${amount} XP`,
  };
  listeners.forEach((l) => l(event));
}

export function subscribeXP(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
