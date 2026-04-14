import React, { useEffect, useRef, useState } from 'react';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, Flame,
  UserPlus, LogIn, User, CheckCircle2, XCircle, ShieldAlert, KeyRound,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import PrivacyPolicyModal from '../legal/PrivacyPolicyModal';
import TermsModal from '../legal/TermsModal';

type AuthMode = 'login' | 'signup';

interface AuthScreenProps {
  onAuth: (identifier: string, password: string, mode: AuthMode, username?: string) => Promise<{ error?: string }>;
  onSkip?: () => void;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; lockedUntil: number }>();

function getLockoutSeconds(count: number): number {
  if (count >= 10) return 3600;
  if (count >= 7)  return 600;
  if (count >= 5)  return 120;
  if (count >= 3)  return 30;
  return 0;
}

function recordFailedAttempt(identifier: string): number {
  const key = identifier.toLowerCase().trim();
  const entry = rateLimitMap.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  const lockSecs = getLockoutSeconds(entry.count);
  entry.lockedUntil = lockSecs > 0 ? Date.now() + lockSecs * 1000 : entry.lockedUntil;
  rateLimitMap.set(key, entry);
  return entry.lockedUntil;
}

function getLockedUntil(identifier: string): number {
  return rateLimitMap.get(identifier.toLowerCase().trim())?.lockedUntil ?? 0;
}

function clearAttempts(identifier: string): void {
  rateLimitMap.delete(identifier.toLowerCase().trim());
}

// ─── Password strength ────────────────────────────────────────────────────────
const PASSWORD_REQUIREMENTS = [
  { key: 'length',  label: 'Minst 8 tegn',        test: (p: string) => p.length >= 8 },
  { key: 'upper',   label: 'Stor bokstav',          test: (p: string) => /[A-Z]/.test(p) },
  { key: 'number',  label: 'Minst ett tall',        test: (p: string) => /[0-9]/.test(p) },
  { key: 'special', label: 'Spesialtegn (!@#…)',   test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function passwordScore(password: string): number {
  return PASSWORD_REQUIREMENTS.filter(r => r.test(password)).length;
}

const STRENGTH_LEVELS = [
  { label: '',             bar: 'bg-zinc-700',   text: 'text-zinc-500' },
  { label: 'Veldig svakt', bar: 'bg-red-500',    text: 'text-red-400' },
  { label: 'Svakt',        bar: 'bg-orange-500', text: 'text-orange-400' },
  { label: 'Middels',      bar: 'bg-yellow-400', text: 'text-yellow-400' },
  { label: 'Sterkt',       bar: 'bg-green-500',  text: 'text-green-400' },
];

// ─── Username validation ──────────────────────────────────────────────────────
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
function validateUsername(u: string): string | null {
  if (!u) return 'Brukernavn er påkrevd';
  if (u.length < 3) return 'Minst 3 tegn';
  if (u.length > 20) return 'Maks 20 tegn';
  if (!USERNAME_RE.test(u)) return 'Kun små bokstaver, tall og _';
  if (u.startsWith('_') || u.endsWith('_')) return 'Kan ikke starte eller slutte med _';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AuthScreen({ onAuth, onSkip }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');

  // Shared fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Signup-only
  const [username, setUsername] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  // Email-not-confirmed state
  const [emailUnconfirmed, setEmailUnconfirmed] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // Forgot-password state
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  // Rate limiting
  const [lockedUntil, setLockedUntil] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  function startCountdown(until: number) {
    setLockedUntil(until);
    if (countdownRef.current) clearInterval(countdownRef.current);
    const tick = () => {
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining <= 0) {
        setCountdown(0); setLockedUntil(0);
        if (countdownRef.current) clearInterval(countdownRef.current);
      } else { setCountdown(remaining); }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  }

  const score = mode === 'signup' ? passwordScore(password) : 0;
  const usernameError = mode === 'signup' && username ? validateUsername(username) : null;

  // ── Forgot-password flow ────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = forgotEmail.trim() || identifier.trim();
    if (!email) { setError('Skriv inn e-postadressen din'); return; }
    if (!email.includes('@')) { setError('Skriv inn en gyldig e-postadresse'); return; }
    if (!supabase) { setError('Supabase ikke konfigurert'); return; }
    setForgotLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email);
    setForgotLoading(false);
    if (err) { setError(err.message); } else { setForgotSent(true); setError(''); }
  };

  // ── Resend confirmation email ───────────────────────────────────────────────
  const handleResendConfirmation = async () => {
    const email = identifier.trim();
    if (!email || !email.includes('@')) { setError('Skriv inn e-postadressen du registrerte deg med'); return; }
    if (!supabase) { setError('Supabase ikke konfigurert'); return; }
    setResendLoading(true);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email });
    setResendLoading(false);
    if (err) { setError(err.message); } else { setResendSent(true); setError(''); }
  };

  // ── Main login/signup submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailUnconfirmed(false);
    setResendSent(false);

    const locked = mode === 'login' ? getLockedUntil(identifier) : 0;
    if (locked > Date.now()) { startCountdown(locked); return; }

    if (!identifier.trim() || !password.trim()) { setError('Fyll inn alle felt'); return; }

    if (mode === 'signup') {
      const uErr = validateUsername(username);
      if (uErr) { setError(uErr); return; }
      if (score < 3) { setError('Passordet er for svakt — bruk minst 8 tegn, stor bokstav og tall'); return; }
      if (password !== confirmPassword) { setError('Passordene stemmer ikke overens'); return; }
      if (!consentAccepted) { setError('Du må godta brukervilkårene og personvernerklæringen'); return; }
    }

    setLoading(true);
    const result = await onAuth(
      identifier.trim(), password, mode,
      mode === 'signup' ? username.toLowerCase().trim() : undefined,
    );
    setLoading(false);

    if (result.error) {
      if (result.error === '__EMAIL_NOT_CONFIRMED__') {
        setEmailUnconfirmed(true);
        setError('');
      } else {
        setError(result.error);
        if (mode === 'login') {
          const until = recordFailedAttempt(identifier);
          if (until > Date.now()) startCountdown(until);
        }
      }
    } else if (mode === 'signup') {
      setSignupSuccess(true);
    } else {
      clearAttempts(identifier);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next); setError(''); setPassword(''); setConfirmPassword('');
    setEmailUnconfirmed(false); setResendSent(false);
  };

  const formatCountdown = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} sek` : `${s} sek`;

  // ── Signup success ──────────────────────────────────────────────────────────
  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Sjekk e-posten din!</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Vi har sendt en bekreftelseslenke til{' '}
            <span className="text-white font-medium">{identifier}</span>.
            Klikk på lenken for å aktivere kontoen din.
          </p>
          <button
            onClick={() => { setSignupSuccess(false); switchMode('login'); }}
            className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
          >
            Tilbake til innlogging →
          </button>
        </div>
      </div>
    );
  }

  // ── Forgot password screen ──────────────────────────────────────────────────
  if (forgotMode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Glemt passord?</h1>
            <p className="text-zinc-500 text-sm">
              Vi sender deg en lenke for å nullstille passordet ditt.
            </p>
          </div>

          {forgotSent ? (
            <div className="space-y-4">
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-center">
                <p className="text-green-400 text-sm">
                  E-post sendt! Sjekk innboksen din (og søppelpost).
                </p>
              </div>
              <button
                onClick={() => { setForgotMode(false); setForgotSent(false); setError(''); }}
                className="w-full text-center text-zinc-400 hover:text-zinc-300 text-sm transition-colors"
              >
                ← Tilbake til innlogging
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  placeholder="Din e-postadresse"
                  value={forgotEmail || identifier}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}
              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50"
              >
                {forgotLoading
                  ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><ArrowRight className="w-4 h-4" />Send tilbakestillingslenke</>}
              </button>
              <button
                type="button"
                onClick={() => { setForgotMode(false); setError(''); }}
                className="w-full text-center text-zinc-500 hover:text-zinc-400 text-sm transition-colors"
              >
                ← Tilbake til innlogging
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  const isLocked = lockedUntil > Date.now();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
            <Flame className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">KaloriFit</h1>
          <p className="text-zinc-500 text-sm">
            {mode === 'login'
              ? 'Logg inn for å synkronisere dataen din'
              : 'Opprett konto for å lagre fremgangen din'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-zinc-800/50 rounded-xl p-1">
          <button
            onClick={() => switchMode('login')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'login' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <LogIn className="w-4 h-4" />Logg inn
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'signup' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <UserPlus className="w-4 h-4" />Ny konto
          </button>
        </div>

        {/* Rate-limit lockout banner */}
        {isLocked && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 text-sm font-medium">For mange forsøk</p>
              <p className="text-red-400/80 text-xs mt-0.5">Prøv igjen om {formatCountdown(countdown)}</p>
            </div>
          </div>
        )}

        {/* Email-not-confirmed banner */}
        {emailUnconfirmed && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-400 text-sm font-medium">E-post ikke bekreftet</p>
                <p className="text-amber-400/80 text-xs mt-0.5">
                  Sjekk innboksen din (og søppelpost) for bekreftelseslenken.
                </p>
              </div>
            </div>
            {resendSent ? (
              <p className="text-green-400 text-xs pl-8">Ny e-post er sendt!</p>
            ) : (
              <button
                onClick={handleResendConfirmation}
                disabled={resendLoading}
                className="ml-8 text-xs text-amber-400 underline underline-offset-2 hover:text-amber-300 transition-colors disabled:opacity-50"
              >
                {resendLoading ? 'Sender…' : 'Send bekreftelsese-post på nytt'}
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            {/* Identifier (email or username for login, email for signup) */}
            <div className="relative">
              {mode === 'login'
                ? <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                : <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />}
              <input
                type={mode === 'signup' ? 'email' : 'text'}
                placeholder={mode === 'login' ? 'E-post eller brukernavn' : 'E-post'}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete={mode === 'signup' ? 'email' : 'email username'}
                disabled={isLocked}
                className="w-full pl-11 pr-4 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all disabled:opacity-50"
              />
            </div>

            {/* Username (signup only) */}
            {mode === 'signup' && (
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Brukernavn (f.eks. kari_98)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  autoComplete="nickname"
                  maxLength={20}
                  className={`w-full pl-11 pr-4 py-3.5 bg-zinc-800/60 border rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none transition-all ${
                    username && usernameError
                      ? 'border-red-500/50 focus:border-red-500/70'
                      : username && !usernameError
                      ? 'border-green-500/50 focus:border-green-500/70'
                      : 'border-zinc-700/50 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20'
                  }`}
                />
                {username && (
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
                    {usernameError
                      ? <XCircle className="w-4 h-4 text-red-400" />
                      : <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  </span>
                )}
                {username && usernameError && (
                  <p className="mt-1 text-xs text-red-400 pl-1">{usernameError}</p>
                )}
                <p className="mt-1 text-xs text-zinc-600 pl-1">
                  Brukes til å logge inn. Kan ikke endres senere.
                </p>
              </div>
            )}

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                disabled={isLocked}
                className="w-full pl-11 pr-11 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all disabled:opacity-50"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength (signup) */}
            {mode === 'signup' && password && (
              <div className="space-y-2 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i < score ? STRENGTH_LEVELS[score]?.bar : 'bg-zinc-700'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${STRENGTH_LEVELS[score]?.text}`}>
                    {STRENGTH_LEVELS[score]?.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const met = req.test(password);
                    return (
                      <div key={req.key} className="flex items-center gap-1.5">
                        {met
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          : <XCircle className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
                        <span className={`text-xs ${met ? 'text-zinc-300' : 'text-zinc-600'}`}>{req.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Confirm password (signup) */}
            {mode === 'signup' && (
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Bekreft passord"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full pl-11 pr-11 py-3.5 bg-zinc-800/60 border rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none transition-all ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-red-500/50'
                      : confirmPassword && confirmPassword === password
                      ? 'border-green-500/50'
                      : 'border-zinc-700/50 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20'
                  }`}
                />
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>

          {/* Consent (signup) */}
          {mode === 'signup' && (
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5 shrink-0">
                <input type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} className="sr-only" />
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${consentAccepted ? 'bg-orange-500 border-orange-500' : 'border-zinc-600 bg-zinc-800/60'}`}>
                  {consentAccepted && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-zinc-400 leading-relaxed">
                Jeg har lest og godtar{' '}
                <button type="button" onClick={() => setShowTerms(true)} className="text-orange-400 hover:text-orange-300 underline underline-offset-2">brukervilkårene</button>
                {' '}og{' '}
                <button type="button" onClick={() => setShowPrivacy(true)} className="text-orange-400 hover:text-orange-300 underline underline-offset-2">personvernerklæringen</button>
                , inkludert behandling av helserelaterte data.
              </span>
            </label>
          )}

          {/* Error */}
          {error && !isLocked && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || isLocked}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : isLocked
              ? <><ShieldAlert className="w-4 h-4" />Låst — vent {formatCountdown(countdown)}</>
              : <>{mode === 'login' ? 'Logg inn' : 'Opprett konto'}<ArrowRight className="w-4 h-4" /></>}
          </button>

          {/* Forgot password link (login only) */}
          {mode === 'login' && !isLocked && (
            <button
              type="button"
              onClick={() => { setForgotMode(true); setForgotEmail(identifier.includes('@') ? identifier : ''); setError(''); }}
              className="w-full text-center text-zinc-500 hover:text-zinc-400 text-xs transition-colors"
            >
              Glemt passord?
            </button>
          )}
        </form>

        {/* Skip */}
        {onSkip && (
          <button onClick={onSkip} className="w-full text-center text-zinc-500 hover:text-zinc-400 text-sm transition-colors">
            Fortsett uten konto (kun lokal lagring)
          </button>
        )}
      </div>

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
