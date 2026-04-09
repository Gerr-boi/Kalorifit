/**
 * OnboardingScreen.tsx
 * Guided onboarding: goal → activity → body stats (with flexible age entry) → meal reminders → done.
 */
import { useState } from 'react';
import {
  Activity,
  Apple,
  Bell,
  Brain,
  ChevronRight,
  Dumbbell,
  Flame,
  Heart,
  Zap,
} from 'lucide-react';
import { useLocalStorageState, getActiveUserIdFromStorage, emitLocalStorageStateChanged } from '../../hooks/useLocalStorageState';
import type { GoalCategory, GoalStrategy, DietStyle, TrainingType, ActivityLevel } from '../../lib/nutritionPlanner';
import { useT } from '../../lib/i18n';
import { requestNotificationPermission } from '../../lib/notificationService';

type Step = 'welcome' | 'goal' | 'training' | 'body' | 'notifications' | 'done';
type AgeMode = 'birthday' | 'year' | 'skip';

type Archetype = {
  id: string;
  label: string;
  description: string;
  icon: typeof Flame;
  color: string;
  goalCategory: GoalCategory;
  goalStrategy: GoalStrategy;
  dietStyle: DietStyle;
  trainingType: TrainingType;
};

const ARCHETYPES: Archetype[] = [
  {
    id: 'fat_loss',
    label: 'Vil gå ned i vekt',
    description: 'Fettforbrenning med bærekraftig underskudd',
    icon: Flame,
    color: '#ef4444',
    goalCategory: 'fat_loss',
    goalStrategy: 'standard_cut',
    dietStyle: 'high_protein',
    trainingType: 'mixed',
  },
  {
    id: 'muscle',
    label: 'Vil bygge muskler',
    description: 'Styrkefokus med nok protein og kalorier',
    icon: Dumbbell,
    color: '#7c3aed',
    goalCategory: 'muscle_gain',
    goalStrategy: 'lean_bulk',
    dietStyle: 'high_protein',
    trainingType: 'strength',
  },
  {
    id: 'recomp',
    label: 'Rekomp — fett ned, muskler opp',
    description: 'Balansert tilnærming med styrketrening',
    icon: Zap,
    color: '#d97706',
    goalCategory: 'recomp',
    goalStrategy: 'high_protein_maintenance',
    dietStyle: 'high_protein',
    trainingType: 'strength',
  },
  {
    id: 'performance',
    label: 'Prestasjon og utholdenhet',
    description: 'Høy karbohydrat for energi og restitusjon',
    icon: Activity,
    color: '#0891b2',
    goalCategory: 'performance',
    goalStrategy: 'endurance_focus',
    dietStyle: 'high_carb_performance',
    trainingType: 'running',
  },
  {
    id: 'health',
    label: 'Generell helse og velvære',
    description: 'Balansert kosthold og aktiv livsstil',
    icon: Heart,
    color: '#16a34a',
    goalCategory: 'health',
    goalStrategy: 'stable_energy',
    dietStyle: 'standard_balanced',
    trainingType: 'mixed',
  },
  {
    id: 'gut',
    label: 'Tarmhelse og energi',
    description: 'Fiber, fermentert mat, stabilt blodsukker',
    icon: Apple,
    color: '#059669',
    goalCategory: 'health',
    goalStrategy: 'gut_health',
    dietStyle: 'mediterranean',
    trainingType: 'mixed',
  },
];

type ActivityOption = { id: ActivityLevel; label: string; description: string };
const ACTIVITY_OPTIONS: ActivityOption[] = [
  { id: 'sedentary', label: 'Stillesittende', description: 'Kontorjobb, lite bevegelse til daglig' },
  { id: 'light', label: 'Lett aktiv', description: '1–3 treningsøkter i uken' },
  { id: 'moderate', label: 'Moderat aktiv', description: '3–5 treningsøkter i uken' },
  { id: 'very', label: 'Svært aktiv', description: '6+ treningsøkter eller fysisk jobb' },
];

type StoredProfile = {
  goalCategory?: GoalCategory;
  goalStrategy?: GoalStrategy;
  dietStyle?: DietStyle;
  trainingType?: TrainingType;
  activityLevel?: ActivityLevel;
  weightKg?: number;
  targetWeightKg?: number;
  heightCm?: number;
  age?: number;
  sex?: 'male' | 'female';
  settingsTier?: 'basic' | 'advanced';
  onboardingCompleted?: boolean;
  notificationsEnabled?: boolean;
  mealReminders?: {
    breakfast: boolean;
    breakfastTime: string;
    lunch: boolean;
    lunchTime: string;
    dinner: boolean;
    dinnerTime: string;
  };
};

const EMPTY_PROFILE: StoredProfile = {};

function ageFromBirthday(dateStr: string): number | null {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
}

function ageFromYear(yearStr: string): number | null {
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year) || year < 1900 || year > new Date().getFullYear() - 5) return null;
  return new Date().getFullYear() - year;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface OnboardingScreenProps {}

export default function OnboardingScreen(_props: OnboardingScreenProps) {
  const [, setProfile] = useLocalStorageState<StoredProfile>('profile', EMPTY_PROFILE);
  const t = useT();

  const [step, setStep] = useState<Step>('welcome');
  const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');

  // Body stats
  const [weightKg, setWeightKg] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [sex, setSex] = useState<'male' | 'female'>('male');

  // Age entry
  const [ageMode, setAgeMode] = useState<AgeMode | null>(null);
  const [birthdayInput, setBirthdayInput] = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');

  // Notifications
  const [notifBreakfast, setNotifBreakfast] = useState(true);
  const [notifLunch, setNotifLunch] = useState(true);
  const [notifDinner, setNotifDinner] = useState(true);
  const [notifDenied, setNotifDenied] = useState(false);

  const [saving, setSaving] = useState(false);

  function resolveAge(): number {
    if (ageMode === 'birthday') return ageFromBirthday(birthdayInput) ?? 30;
    if (ageMode === 'year') return ageFromYear(birthYearInput) ?? 30;
    return 30;
  }

  function handleArchetypeSelect(a: Archetype) {
    setSelectedArchetype(a);
    setStep('training');
  }

  function handleActivitySelect(level: ActivityLevel) {
    setActivityLevel(level);
    setStep('body');
  }

  function handleBodyNext() {
    setStep('notifications');
  }

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission();
    if (!granted) {
      setNotifDenied(true);
      return;
    }
    finishOnboarding(true);
  }

  function handleSkipNotifications() {
    finishOnboarding(false);
  }

  function finishOnboarding(notificationsEnabled: boolean) {
    if (saving) return;
    setSaving(true);

    const wt = parseFloat(weightKg);
    const twt = parseFloat(targetWeightKg);
    const ht = parseFloat(heightCm);

    const payload: StoredProfile = {
      goalCategory: selectedArchetype?.goalCategory ?? 'fat_loss',
      goalStrategy: selectedArchetype?.goalStrategy ?? 'standard_cut',
      dietStyle: selectedArchetype?.dietStyle ?? 'standard_balanced',
      trainingType: selectedArchetype?.trainingType ?? 'mixed',
      activityLevel,
      weightKg: Number.isFinite(wt) && wt > 0 ? wt : 70,
      targetWeightKg: Number.isFinite(twt) && twt > 0 ? twt : undefined,
      heightCm: Number.isFinite(ht) && ht > 0 ? ht : 170,
      age: resolveAge(),
      sex,
      settingsTier: 'basic',
      onboardingCompleted: true,
      notificationsEnabled,
      mealReminders: {
        breakfast: notifBreakfast,
        breakfastTime: '09:00',
        lunch: notifLunch,
        lunchTime: '12:30',
        dinner: notifDinner,
        dinnerTime: '18:00',
      },
    };

    try {
      const userId = getActiveUserIdFromStorage();
      window.localStorage.setItem(`u:${userId}:profile`, JSON.stringify(payload));
      emitLocalStorageStateChanged('profile');
    } catch {
      // fall through to hook write
    }

    setProfile(payload);
    setStep('done');
  }

  const STEP_COUNT = 4; // goal, training, body, notifications
  const stepIndex: Record<Step, number> = {
    welcome: 0, goal: 1, training: 2, body: 3, notifications: 4, done: 5,
  };
  const progress = stepIndex[step];

  const showTargetWeight =
    selectedArchetype?.goalCategory === 'fat_loss' ||
    selectedArchetype?.goalCategory === 'muscle_gain';

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #f0fdf4 0%, #eff6ff 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0 20px 40px',
      overflowY: 'auto',
    }}>

      {/* Progress bar */}
      {step !== 'welcome' && step !== 'done' && (
        <div style={{ paddingTop: 20, paddingBottom: 4 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {Array.from({ length: STEP_COUNT }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i < progress ? '#16a34a' : '#d1fae5',
                  transition: 'background 0.3s ease',
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, marginBottom: 0 }}>
            {t('onboarding.stepOf', { step: progress, total: STEP_COUNT })}
          </p>
        </div>
      )}

      {/* ── Welcome ── */}
      {step === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 0, paddingTop: 60, paddingBottom: 40 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24,
            background: 'linear-gradient(135deg, #16a34a, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, marginBottom: 24,
            boxShadow: '0 8px 24px rgba(22,163,74,0.30)',
          }}>
            🥗
          </div>

          <h1 style={{ fontSize: 30, fontWeight: 900, color: '#111827', margin: '0 0 12px', lineHeight: 1.15, letterSpacing: '-0.5px' }}>
            {t('onboarding.welcome.title')}<br />
            <span style={{ color: '#16a34a' }}>KaloriFit</span>
          </h1>

          <p style={{ fontSize: 15, color: '#6b7280', maxWidth: 270, margin: '0 0 32px', lineHeight: 1.6 }}>
            {t('onboarding.welcome.subtitle')}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 36 }}>
            {[
              { icon: '📷', label: t('onboarding.welcome.features.scanner') },
              { icon: '🧠', label: t('onboarding.welcome.features.coach') },
              { icon: '📈', label: t('onboarding.welcome.features.forecast') },
              { icon: '⚡', label: t('onboarding.welcome.features.logging') },
            ].map((f) => (
              <span key={f.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 20,
                background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.15)',
                fontSize: 12, fontWeight: 600, color: '#166534',
              }}>
                {f.icon} {f.label}
              </span>
            ))}
          </div>

          <button onClick={() => setStep('goal')} style={ctaButton}>
            {t('onboarding.welcome.cta')} <ChevronRight size={18} />
          </button>

          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 14 }}>
            {t('onboarding.welcome.timing')}
          </p>

          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 10, maxWidth: 280, lineHeight: 1.6, textAlign: 'center' }}>
            Ved å fortsette registrerer du helserelaterte data (vekt, kosthold, mål).
            KaloriFit er ikke medisinsk rådgivning — rådfør deg med helsepersonell ved behov.
          </p>
        </div>
      )}

      {/* ── Goal / Archetype ── */}
      {step === 'goal' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
          <h2 style={stepTitle}>{t('onboarding.goal.title')}</h2>
          <p style={stepSub}>{t('onboarding.goal.subtitle')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {ARCHETYPES.map((a) => {
              const Icon = a.icon;
              return (
                <button key={a.id} onClick={() => handleArchetypeSelect(a)} style={choiceButton}>
                  <span style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: `${a.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={18} color={a.color} />
                  </span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{t(`onboarding.archetypes.${a.id}.label`)}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 2 }}>{t(`onboarding.archetypes.${a.id}.description`)}</span>
                  </span>
                  <ChevronRight size={15} color="#d1d5db" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Activity level ── */}
      {step === 'training' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
          <button onClick={() => setStep('goal')} style={backLink}>{t('onboarding.training.back')}</button>
          <h2 style={stepTitle}>{t('onboarding.training.title')}</h2>
          <p style={stepSub}>{t('onboarding.training.subtitle')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {ACTIVITY_OPTIONS.map((opt) => {
              const selected = activityLevel === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleActivitySelect(opt.id)}
                  style={{
                    ...choiceButton,
                    border: selected ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                    background: selected ? '#f0fdf4' : '#fff',
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: selected ? '#166534' : '#111827' }}>{t(`onboarding.activity.${opt.id}.label`)}</span>
                    <span style={{ display: 'block', fontSize: 12, color: '#6b7280', marginTop: 2 }}>{t(`onboarding.activity.${opt.id}.description`)}</span>
                  </span>
                  {selected
                    ? <span style={{ fontSize: 16 }}>✓</span>
                    : <ChevronRight size={15} color="#d1d5db" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Body stats ── */}
      {step === 'body' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
          <button onClick={() => setStep('training')} style={backLink}>{t('onboarding.body.back')}</button>
          <h2 style={stepTitle}>{t('onboarding.body.title')}</h2>
          <p style={stepSub}>{t('onboarding.body.subtitle')}</p>

          {/* Sex toggle */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {(['male', 'female'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSex(s)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                  border: sex === s ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                  background: sex === s ? '#f0fdf4' : '#fff',
                  fontSize: 14, fontWeight: 700,
                  color: sex === s ? '#16a34a' : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'male' ? t('onboarding.body.male') : t('onboarding.body.female')}
              </button>
            ))}
          </div>

          {/* Weight + height */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {[
              { label: t('onboarding.body.weight'), unit: 'kg', value: weightKg, onChange: setWeightKg, placeholder: '70' },
              { label: t('onboarding.body.height'), unit: 'cm', value: heightCm, onChange: setHeightCm, placeholder: '170' },
            ].map((field) => (
              <div key={field.label}>
                <label style={fieldLabel}>{field.label}</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={field.placeholder}
                    style={numberInput}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  />
                  <span style={unitLabel}>{field.unit}</span>
                </div>
              </div>
            ))}

            {/* Optional target weight */}
            {showTargetWeight && (
              <div>
                <label style={fieldLabel}>
                  {t('onboarding.body.targetWeight')}{' '}
                  <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', fontSize: 11 }}>
                    ({t('onboarding.body.optional')})
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={targetWeightKg}
                    onChange={(e) => setTargetWeightKg(e.target.value)}
                    placeholder={
                      selectedArchetype?.goalCategory === 'fat_loss' ? '65' : '80'
                    }
                    style={numberInput}
                    onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                  />
                  <span style={unitLabel}>kg</span>
                </div>
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>
                  {t('onboarding.body.targetWeightHint')}
                </p>
              </div>
            )}
          </div>

          {/* Age entry */}
          <div style={{ marginTop: 14 }}>
            <label style={fieldLabel}>{t('onboarding.body.age')}</label>

            {/* Mode selector chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {([
                { mode: 'birthday' as AgeMode, emoji: '📅', label: t('onboarding.ageMode.birthday') },
                { mode: 'year' as AgeMode, emoji: '📆', label: t('onboarding.ageMode.year') },
                { mode: 'skip' as AgeMode, emoji: '🙈', label: t('onboarding.ageMode.skip') },
              ]).map(({ mode, emoji, label }) => (
                <button
                  key={mode}
                  onClick={() => setAgeMode(mode)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                    border: ageMode === mode ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                    background: ageMode === mode ? '#f0fdf4' : '#fff',
                    fontSize: 11, fontWeight: 700,
                    color: ageMode === mode ? '#166534' : '#374151',
                    transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{emoji}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Birthday input */}
            {ageMode === 'birthday' && (
              <input
                type="date"
                value={birthdayInput}
                onChange={(e) => setBirthdayInput(e.target.value)}
                max={`${new Date().getFullYear() - 5}-12-31`}
                min="1920-01-01"
                style={{ ...numberInput, paddingRight: 14 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
              />
            )}

            {/* Year of birth input */}
            {ageMode === 'year' && (
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  inputMode="numeric"
                  value={birthYearInput}
                  onChange={(e) => setBirthYearInput(e.target.value)}
                  placeholder={String(new Date().getFullYear() - 28)}
                  min="1920"
                  max={String(new Date().getFullYear() - 5)}
                  style={numberInput}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#16a34a'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                />
                <span style={unitLabel}>{t('onboarding.ageMode.yearUnit')}</span>
              </div>
            )}

            {/* Skip message */}
            {ageMode === 'skip' && (
              <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0', lineHeight: 1.5 }}>
                {t('onboarding.ageMode.skipHint')}
              </p>
            )}
          </div>

          <button
            onClick={handleBodyNext}
            style={{ ...ctaButton, marginTop: 20 }}
          >
            {t('onboarding.body.next')} <ChevronRight size={18} />
          </button>
          <button
            onClick={handleBodyNext}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer', padding: '10px 0', marginTop: 4 }}
          >
            {t('onboarding.body.skip')}
          </button>
        </div>
      )}

      {/* ── Notifications ── */}
      {step === 'notifications' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 20 }}>
          <button onClick={() => setStep('body')} style={backLink}>{t('onboarding.notifications.back')}</button>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 13,
              background: 'linear-gradient(135deg, #16a34a, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bell size={20} color="#fff" />
            </div>
            <h2 style={{ ...stepTitle, margin: 0 }}>{t('onboarding.notifications.title')}</h2>
          </div>
          <p style={stepSub}>{t('onboarding.notifications.subtitle')}</p>

          {/* Meal toggles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            {[
              { emoji: '🍳', label: t('onboarding.notifications.breakfast'), time: '09:00', enabled: notifBreakfast, setEnabled: setNotifBreakfast },
              { emoji: '🥗', label: t('onboarding.notifications.lunch'), time: '12:30', enabled: notifLunch, setEnabled: setNotifLunch },
              { emoji: '🍽', label: t('onboarding.notifications.dinner'), time: '18:00', enabled: notifDinner, setEnabled: setNotifDinner },
            ].map(({ emoji, label, time, enabled, setEnabled }) => (
              <button
                key={label}
                onClick={() => setEnabled(!enabled)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 14px', borderRadius: 14,
                  border: enabled ? '2px solid #16a34a' : '1.5px solid #e5e7eb',
                  background: enabled ? '#f0fdf4' : '#fff',
                  cursor: 'pointer', width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 22 }}>{emoji}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: enabled ? '#166534' : '#111827' }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', marginTop: 1 }}>{time}</span>
                </span>
                {/* Toggle pill */}
                <div style={{
                  width: 42, height: 24, borderRadius: 12, flexShrink: 0,
                  background: enabled ? '#16a34a' : '#e5e7eb',
                  position: 'relative', transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, borderRadius: '50%',
                    width: 18, height: 18, background: '#fff',
                    left: enabled ? 21 : 3,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </div>
              </button>
            ))}
          </div>

          {notifDenied && (
            <p style={{ fontSize: 12, color: '#ef4444', marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
              {t('onboarding.notifications.denied')}
            </p>
          )}

          <button onClick={handleEnableNotifications} style={{ ...ctaButton, marginTop: 20 }}>
            <Bell size={16} /> {t('onboarding.notifications.cta')}
          </button>
          <button
            onClick={handleSkipNotifications}
            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 12, cursor: 'pointer', padding: '10px 0', marginTop: 4 }}
          >
            {t('onboarding.notifications.skip')}
          </button>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 12, paddingTop: 60 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22,
            background: 'linear-gradient(135deg, #16a34a, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, marginBottom: 8,
            boxShadow: '0 8px 24px rgba(22,163,74,0.35)',
          }}>
            ✓
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 900, color: '#111827', margin: 0 }}>{t('onboarding.done.title')}</h2>
          <p style={{ fontSize: 14, color: '#6b7280', maxWidth: 260, margin: 0, lineHeight: 1.6 }}>
            {t('onboarding.done.subtitle')}
          </p>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8,
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 20, padding: '8px 16px',
          }}>
            <Brain size={15} color="#16a34a" />
            <span style={{ fontSize: 13, color: '#166534', fontWeight: 700 }}>{t('onboarding.done.coachActive')}</span>
          </div>
          {selectedArchetype && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
              {t('onboarding.done.goal')} <strong style={{ color: '#374151' }}>{t(`onboarding.archetypes.${selectedArchetype.id}.label`)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──

const ctaButton: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', padding: '15px 24px', borderRadius: 14,
  background: 'linear-gradient(135deg, #16a34a, #059669)',
  color: '#fff', fontSize: 15, fontWeight: 800, border: 'none', cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(22,163,74,0.35)',
  transition: 'opacity 0.15s',
};

const stepTitle: React.CSSProperties = {
  fontSize: 23, fontWeight: 900, color: '#111827', margin: '8px 0 0', letterSpacing: '-0.3px',
};

const stepSub: React.CSSProperties = {
  fontSize: 13, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5,
};

const choiceButton: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '13px 14px', borderRadius: 14,
  border: '1.5px solid #e5e7eb', background: '#fff',
  cursor: 'pointer', width: '100%',
  transition: 'border-color 0.15s, background 0.15s',
};

const backLink: React.CSSProperties = {
  background: 'none', border: 'none', color: '#9ca3af',
  fontSize: 13, cursor: 'pointer', padding: '0 0 8px', textAlign: 'left',
};

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#374151',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const numberInput: React.CSSProperties = {
  width: '100%', padding: '11px 40px 11px 14px', borderRadius: 12,
  border: '1.5px solid #e5e7eb', fontSize: 16, background: '#fff',
  boxSizing: 'border-box', outline: 'none',
  transition: 'border-color 0.15s',
};

const unitLabel: React.CSSProperties = {
  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
  fontSize: 13, color: '#9ca3af', fontWeight: 600, pointerEvents: 'none',
};
