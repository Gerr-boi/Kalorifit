/**
 * CoachCard.tsx
 * Daily adaptive coach card — surfaces the single most important action for today.
 * Sits at the top of HomeScreen, below the header.
 */
import { Brain, ChevronDown, ChevronUp, Droplets, Dumbbell, Flame, TrendingUp, Zap } from 'lucide-react';
import { useState } from 'react';
import type { CoachMessage, CoachPriority } from '../../lib/coachEngine';

interface CoachCardProps {
  message: CoachMessage;
  onDismiss?: () => void;
  onAction?: (priority: CoachPriority) => void;
  lang?: 'Norsk' | 'English';
}

const priorityConfig: Record<CoachPriority, { icon: typeof Flame; color: string; bg: string; border: string }> = {
  protein: {
    icon: Zap,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.08)',
    border: 'rgba(124,58,237,0.20)',
  },
  calories_under: {
    icon: TrendingUp,
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.08)',
    border: 'rgba(37,99,235,0.20)',
  },
  calories_over: {
    icon: Flame,
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.20)',
  },
  water: {
    icon: Droplets,
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.08)',
    border: 'rgba(8,145,178,0.20)',
  },
  workout: {
    icon: Dumbbell,
    color: '#d97706',
    bg: 'rgba(217,119,6,0.08)',
    border: 'rgba(217,119,6,0.20)',
  },
  logging: {
    icon: Brain,
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
    border: 'rgba(5,150,105,0.20)',
  },
  on_track: {
    icon: Flame,
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.08)',
    border: 'rgba(22,163,74,0.20)',
  },
  rest_day: {
    icon: TrendingUp,
    color: '#64748b',
    bg: 'rgba(100,116,139,0.08)',
    border: 'rgba(100,116,139,0.20)',
  },
};

function UrgencyDot({ urgency }: { urgency: CoachMessage['urgency'] }) {
  const colors = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: colors[urgency],
        marginRight: 5,
        flexShrink: 0,
      }}
    />
  );
}

function MacroPill({ label, value, unit, done, leftLabel }: { label: string; value: number; unit: string; done: boolean; leftLabel: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 20,
        background: done ? 'rgba(22,163,74,0.13)' : 'rgba(0,0,0,0.06)',
        color: done ? '#16a34a' : '#374151',
      }}
    >
      {label}: {done ? '✓' : `${Math.round(Math.abs(value))}${unit} ${leftLabel}`}
    </span>
  );
}

export default function CoachCard({ message, onAction, lang = 'Norsk' }: CoachCardProps) {
  const [expanded, setExpanded] = useState(false);
  const cfg = priorityConfig[message.priority];
  const Icon = cfg.icon;
  const en = lang === 'English';

  const kcalDone = message.kcalRemaining <= 0;
  const proteinDone = message.proteinRemaining <= 0;

  const actionLabels: Partial<Record<CoachPriority, string>> = {
    protein: en ? 'Log food' : 'Logg mat',
    calories_under: en ? 'Log food' : 'Logg mat',
    logging: en ? 'Log food' : 'Logg mat',
    water: en ? 'Log water' : 'Logg vann',
    workout: en ? 'Log workout' : 'Logg trening',
  };

  return (
    <div
      style={{
        margin: '0 0 12px 0',
        borderRadius: 14,
        border: `1.5px solid ${cfg.border}`,
        background: cfg.bg,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Main row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '12px 14px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {/* Icon */}
        <span
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 10,
            background: cfg.color + '1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}
        >
          <Icon size={16} color={cfg.color} />
        </span>

        {/* Text */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <UrgencyDot urgency={message.urgency} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
              {message.headline}
            </span>
          </span>
          <span style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.4, display: 'block' }}>
            {message.action}
          </span>
        </span>

        {/* Expand toggle */}
        <span style={{ flexShrink: 0, color: '#9ca3af', marginTop: 6 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {/* Macro pills row */}
      <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px 56px', flexWrap: 'wrap' }}>
        <MacroPill label="Kcal" value={message.kcalRemaining} unit="kcal" done={kcalDone} leftLabel={en ? 'left' : 'igjen'} />
        <MacroPill label="Protein" value={message.proteinRemaining} unit="g" done={proteinDone} leftLabel={en ? 'left' : 'igjen'} />
        {message.isTrainingDay && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 20,
              background: 'rgba(217,119,6,0.12)',
              color: '#d97706',
            }}
          >
            <Dumbbell size={10} /> {en ? 'Training day' : 'Treningsdag'}
          </span>
        )}
      </div>

      {/* Expanded reason */}
      {expanded && (
        <div
          style={{
            padding: '10px 14px 12px 56px',
            fontSize: 12,
            color: '#6b7280',
            lineHeight: 1.5,
            borderTop: `1px solid ${cfg.border}`,
          }}
        >
          {message.reason}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11 }}>
              {en ? 'Goal' : 'Mål'}: <strong>{Math.round(message.targetKcal)} kcal</strong>
            </span>
            <span style={{ fontSize: 11 }}>
              Protein: <strong>{Math.round(message.targetProteinG)}g</strong>
            </span>
            {onAction && actionLabels[message.priority] && (
              <button
                onClick={(e) => { e.stopPropagation(); onAction(message.priority); }}
                style={{
                  marginLeft: 'auto',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: `1.5px solid ${cfg.color}`,
                  background: cfg.color + '15',
                  color: cfg.color,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {actionLabels[message.priority]} →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
