/**
 * TrajectoryChart.tsx
 * Nutrition Twin — 6-week weight trend projection based on average calorie deficit/surplus.
 * Uses: last 14 days of logs + current body weight + goal mode.
 * Formula: 7700 kcal ≈ 1kg body fat. 500 kcal/day deficit ≈ 0.5kg/week.
 */
import { useMemo } from 'react';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { DayLog } from '../../lib/disciplineEngine';
import { toDateKey, addDays, startOfDay } from '../../lib/disciplineEngine';
import { buildSmartDietPlan, normalizeNutritionProfile } from '../../lib/nutritionPlanner';
import type { NutritionProfile } from '../../lib/nutritionPlanner';

interface TrajectoryChartProps {
  logsByDate: Record<string, DayLog>;
  rawProfile: Partial<NutritionProfile> | null | undefined;
}

type ProjectionPoint = {
  weekLabel: string;
  weightKg: number;
  isProjected: boolean;
};

function computeProjection(
  logsByDate: Record<string, DayLog>,
  rawProfile: Partial<NutritionProfile> | null | undefined,
): ProjectionPoint[] | null {
  const profile = normalizeNutritionProfile(rawProfile);
  const plan = buildSmartDietPlan({ profile, logsByDate, logEvents: [], weightHistory: [], date: new Date() });
  const targetKcal = plan.optimizedTargetKcal;
  const startWeightKg = profile.weightKg;

  if (!startWeightKg || startWeightKg <= 0) return null;

  // Average daily surplus/deficit over the last 14 days
  const today = startOfDay(new Date());
  let totalKcal = 0;
  let daysWithData = 0;
  for (let i = 1; i <= 14; i++) {
    const key = toDateKey(addDays(today, -i));
    const log = logsByDate[key];
    if (!log) continue;
    const eaten = Object.values(log.meals).flat().reduce((s, e) => s + e.kcal, 0);
    if (eaten > 0) {
      totalKcal += eaten;
      daysWithData++;
    }
  }

  if (daysWithData < 3) return null; // not enough data

  const avgDailyKcal = totalKcal / daysWithData;
  const dailyBalance = avgDailyKcal - targetKcal; // positive = surplus, negative = deficit
  const weeklyWeightChangeKg = (dailyBalance * 7) / 7700; // 7700 kcal per kg fat

  const points: ProjectionPoint[] = [];
  // Week 0 = now
  points.push({ weekLabel: 'Nå', weightKg: startWeightKg, isProjected: false });
  for (let w = 1; w <= 6; w++) {
    const projected = startWeightKg + weeklyWeightChangeKg * w;
    points.push({ weekLabel: `+${w}u`, weightKg: Math.round(projected * 10) / 10, isProjected: true });
  }
  return points;
}

export default function TrajectoryChart({ logsByDate, rawProfile }: TrajectoryChartProps) {
  const points = useMemo(
    () => computeProjection(logsByDate, rawProfile),
    [logsByDate, rawProfile],
  );

  if (!points) {
    return (
      <div
        style={{
          borderRadius: 14,
          border: '1.5px solid #e5e7eb',
          background: '#f9fafb',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
          Logg minst 3 dager for å se 6-ukers vektprognosen din.
        </p>
      </div>
    );
  }

  const startWeight = points[0].weightKg;
  const endWeight = points[points.length - 1].weightKg;
  const totalChange = endWeight - startWeight;
  const isLoss = totalChange < -0.1;
  const isGain = totalChange > 0.1;

  const allWeights = points.map((p) => p.weightKg);
  const minW = Math.min(...allWeights);
  const maxW = Math.max(...allWeights);
  const range = Math.max(maxW - minW, 0.5);

  const CHART_WIDTH = 280;
  const CHART_HEIGHT = 80;
  const PAD_X = 8;
  const PAD_Y = 8;

  const toX = (i: number) => PAD_X + (i / (points.length - 1)) * (CHART_WIDTH - PAD_X * 2);
  const toY = (w: number) => PAD_Y + ((maxW - w) / range) * (CHART_HEIGHT - PAD_Y * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.weightKg)}`)
    .join(' ');

  const areaD =
    pathD +
    ` L ${toX(points.length - 1)} ${CHART_HEIGHT} L ${toX(0)} ${CHART_HEIGHT} Z`;

  const lineColor = isLoss ? '#16a34a' : isGain ? '#dc2626' : '#6366f1';
  const areaColor = isLoss ? '#dcfce7' : isGain ? '#fee2e2' : '#ede9fe';

  const TrendIcon = isLoss ? TrendingDown : isGain ? TrendingUp : Minus;
  const trendLabel = isLoss
    ? `${Math.abs(totalChange).toFixed(1)}kg ned på 6 uker`
    : isGain
    ? `${totalChange.toFixed(1)}kg opp på 6 uker`
    : 'Stabilt vekt de neste 6 ukene';

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1.5px solid #e5e7eb',
        background: '#fff',
        padding: '14px 16px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>Vektprognose</p>
          <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Basert på de siste 14 dagene</p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: isLoss ? '#f0fdf4' : isGain ? '#fef2f2' : '#f5f3ff',
            color: lineColor,
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          <TrendIcon size={13} />
          {trendLabel}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        style={{ width: '100%', height: 80, display: 'block' }}
        preserveAspectRatio="none"
      >
        {/* Area fill */}
        <path d={areaD} fill={areaColor} opacity={0.5} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(p.weightKg)}
            r={i === 0 ? 4 : 2.5}
            fill={i === 0 ? lineColor : '#fff'}
            stroke={lineColor}
            strokeWidth={1.5}
          />
        ))}
      </svg>

      {/* X axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {points.map((p, i) => (
          <span
            key={i}
            style={{
              fontSize: 10,
              color: i === 0 ? '#111827' : '#9ca3af',
              fontWeight: i === 0 ? 700 : 400,
            }}
          >
            {p.weekLabel}
          </span>
        ))}
      </div>

      {/* Weight labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
        {points.map((p, i) => (
          <span
            key={i}
            style={{
              fontSize: 10,
              color: i === points.length - 1 ? lineColor : '#6b7280',
              fontWeight: i === points.length - 1 ? 700 : 400,
            }}
          >
            {p.weightKg}
          </span>
        ))}
      </div>

      <p style={{ fontSize: 10, color: '#9ca3af', marginTop: 8, marginBottom: 0 }}>
        * Prognose basert på gjennomsnittlig daglig kaloribalanse. Ikke medisinsk rådgivning.
      </p>
    </div>
  );
}
