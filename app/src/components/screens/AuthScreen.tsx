import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Flame, UserPlus, LogIn } from 'lucide-react';
import PrivacyPolicyModal from '../legal/PrivacyPolicyModal';
import TermsModal from '../legal/TermsModal';

type AuthMode = 'login' | 'signup';

interface AuthScreenProps {
  onAuth: (email: string, password: string, mode: AuthMode) => Promise<{ error?: string }>;
  onSkip?: () => void;
}

export default function AuthScreen({ onAuth, onSkip }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Fyll inn e-post og passord');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passordene stemmer ikke overens');
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setError('Passord må være minst 6 tegn');
      return;
    }

    if (mode === 'signup' && !consentAccepted) {
      setError('Du må godta brukervilkårene og personvernerklæringen for å opprette konto');
      return;
    }

    setLoading(true);
    const result = await onAuth(email, password, mode);
    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === 'signup') {
      setSignupSuccess(true);
    }
  };

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto">
            <Mail className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Sjekk e-posten din!</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Vi har sendt en bekreftelseslenke til <span className="text-white font-medium">{email}</span>.
            Klikk på lenken for å aktivere kontoen din.
          </p>
          <button
            onClick={() => { setSignupSuccess(false); setMode('login'); }}
            className="text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
          >
            Tilbake til innlogging →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo & header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
            <Flame className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">KaloriFit</h1>
          <p className="text-zinc-500 text-sm">
            {mode === 'login' ? 'Logg inn for å synkronisere dataen din' : 'Opprett konto for å lagre fremgangen din'}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-zinc-800/50 rounded-xl p-1">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <LogIn className="w-4 h-4" />
            Logg inn
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'signup'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            Ny konto
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
              <input
                type="email"
                placeholder="E-post"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full pl-11 pr-4 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full pl-11 pr-11 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
            {mode === 'signup' && (
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Bekreft passord"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full pl-11 pr-4 py-3.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                />
              </div>
            )}
          </div>

          {mode === 'signup' && (
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    consentAccepted
                      ? 'bg-orange-500 border-orange-500'
                      : 'border-zinc-600 bg-zinc-800/60'
                  }`}
                >
                  {consentAccepted && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-zinc-400 leading-relaxed">
                Jeg har lest og godtar{' '}
                <button
                  type="button"
                  onClick={() => setShowTerms(true)}
                  className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
                >
                  brukervilkårene
                </button>
                {' '}og{' '}
                <button
                  type="button"
                  onClick={() => setShowPrivacy(true)}
                  className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
                >
                  personvernerklæringen
                </button>
                , inkludert behandling av helserelaterte data.
              </span>
            </label>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold rounded-xl shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                {mode === 'login' ? 'Logg inn' : 'Opprett konto'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Skip option */}
        {onSkip && (
          <button
            onClick={onSkip}
            className="w-full text-center text-zinc-500 hover:text-zinc-400 text-sm transition-colors"
          >
            Fortsett uten konto (kun lokal lagring)
          </button>
        )}
      </div>

      {showPrivacy && <PrivacyPolicyModal onClose={() => setShowPrivacy(false)} />}
      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}
    </div>
  );
}
