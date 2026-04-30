import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Users, Camera, UtensilsCrossed, User } from 'lucide-react';
import HomeScreen from './components/screens/HomeScreen';
import CommunityScreen from './components/screens/CommunityScreen';
import ScanScreen from './components/screens/ScanScreen';
import MealsScreen from './components/screens/MealsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import OnboardingScreen from './components/screens/OnboardingScreen';
import AuthScreen from './components/screens/AuthScreen';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import { useSupabaseSync } from './hooks/useSupabaseSync';
import { isSupabaseConfigured } from './lib/supabase';
import { DatabaseProvider } from './components/DatabaseProvider';
import { I18nProvider, useT, type Language } from './lib/i18n';
import {
  ensureWeeklyReportForSunday,
  type DayLog,
  type WeeklyPerformanceReport,
} from './lib/disciplineEngine';
import {
  ensureMonthlyIdentityReport,
  type IdentityReportsByMonth,
} from './lib/identityEngine';
import { scheduleMealReminders } from './lib/notificationService';
import './App.css';

type Tab = 'home' | 'community' | 'scan' | 'meals' | 'profile';
const EMPTY_DAY_LOGS: Record<string, DayLog> = {};
const EMPTY_WEEKLY_REPORTS: Record<string, WeeklyPerformanceReport> = {};
const EMPTY_IDENTITY_REPORTS: IdentityReportsByMonth = {};
const EMPTY_PROFILE: Record<string, unknown> = {};

/** Translate Supabase's English auth errors into Norwegian. */
function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'Feil e-post/brukernavn eller passord';
  if (m.includes('email not confirmed'))
    return '__EMAIL_NOT_CONFIRMED__'; // sentinel — AuthScreen shows resend button
  if (m.includes('user already registered'))
    return 'Det finnes allerede en konto med denne e-postadressen';
  if (m.includes('user not found'))
    return 'Ingen konto med denne e-postadressen';
  if (m.includes('password should be at least'))
    return 'Passordet er for kort';
  if (m.includes('rate limit') || m.includes('too many request') || m.includes('email rate limit') || m.includes('over_email_send_rate_limit'))
    return '__RATE_LIMITED__'; // sentinel — AuthScreen shows friendly wait message
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Nettverksfeil — sjekk internettilkoblingen din';
  if (!msg) return 'Noe gikk galt — prøv igjen';
  // Fall through with original message so we can see unexpected errors
  return msg;
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [transitioning, setTransitioning] = useState(false);
  const [displayedTab, setDisplayedTab] = useState<Tab>('home');
  const pendingTab = useRef<Tab | null>(null);
  const [skippedAuth, setSkippedAuth] = useState(() => {
    try { return window.localStorage.getItem('kalorifit:skippedAuth') === 'true'; } catch { return false; }
  });

  // Detect Supabase email-confirmation redirect (hash contains type=signup)
  const [emailJustConfirmed, setEmailJustConfirmed] = useState(() => {
    try {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      return params.get('type') === 'signup';
    } catch { return false; }
  });
  useCurrentUser();

  // Supabase auth + sync
  const { user, loading: authLoading, isAuthenticated, signUp, signIn, signOut } = useSupabaseAuth();
  useSupabaseSync(user);

  const handleAuth = useCallback(async (identifier: string, password: string, mode: 'login' | 'signup', username?: string) => {
    if (mode === 'signup') {
      const result = await signUp(identifier, password, username);
      if (result.error) {
        const raw = typeof result.error === 'string' ? result.error : (result.error as { message?: string }).message || '';
        return { error: translateAuthError(raw) };
      }
      return {};
    } else {
      const result = await signIn(identifier, password);
      if (result.error) {
        const raw = typeof result.error === 'string' ? result.error : (result.error as { message?: string }).message || '';
        return { error: translateAuthError(raw) };
      }
      return {};
    }
  }, [signIn, signUp]);

  const handleSkipAuth = useCallback(() => {
    setSkippedAuth(true);
    try { window.localStorage.setItem('kalorifit:skippedAuth', 'true'); } catch {}
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setSkippedAuth(false);
    try { window.localStorage.removeItem('kalorifit:skippedAuth'); } catch {}
  }, [signOut]);
  const [profileRaw] = useLocalStorageState<Record<string, unknown>>('profile', EMPTY_PROFILE);
  const onboardingCompleted = Boolean((profileRaw as { onboardingCompleted?: boolean }).onboardingCompleted);
  const language = ((profileRaw as { language?: string }).language === 'English' ? 'English' : 'Norsk') as Language;
  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', EMPTY_DAY_LOGS);
  const [, setWeeklyReports] = useLocalStorageState<Record<string, WeeklyPerformanceReport>>(
    'home.weeklyReports.v1',
    EMPTY_WEEKLY_REPORTS,
  );
  const [, setIdentityReports] = useLocalStorageState<IdentityReportsByMonth>(
    'home.identityReports.v1',
    EMPTY_IDENTITY_REPORTS,
  );

  // Schedule meal reminder notifications based on saved profile prefs
  useEffect(() => {
    const p = profileRaw as {
      notificationsEnabled?: boolean;
      mealReminders?: {
        breakfast?: boolean; breakfastTime?: string;
        lunch?: boolean; lunchTime?: string;
        dinner?: boolean; dinnerTime?: string;
      };
    };
    if (p.notificationsEnabled && p.mealReminders) {
      scheduleMealReminders(p.mealReminders, language);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileRaw]);

  useEffect(() => {
    setWeeklyReports((prev) => ensureWeeklyReportForSunday(new Date(), logsByDate, prev));
  }, [logsByDate, setWeeklyReports]);

  useEffect(() => {
    setIdentityReports((prev) => ensureMonthlyIdentityReport(new Date(), logsByDate, prev));
  }, [logsByDate, setIdentityReports]);

  const navigateTo = (tab: Tab) => {
    if (tab === activeTab) return;
    pendingTab.current = tab;
    setActiveTab(tab);
    setTransitioning(true);
    // Brief fade-out, then swap content and fade in
    setTimeout(() => {
      setDisplayedTab(pendingTab.current!);
      setTransitioning(false);
    }, 120);
  };

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ tab?: Tab }>;
      const nextTab = customEvent.detail?.tab;
      if (nextTab) navigateTo(nextTab);
    };
    window.addEventListener('kalorifit:navigate', onNavigate as EventListener);
    return () => window.removeEventListener('kalorifit:navigate', onNavigate as EventListener);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const bootStatus = document.getElementById('boot-status');
    if (!bootStatus) return;

    const cleanup = window.requestAnimationFrame(() => {
      bootStatus.remove();
    });

    return () => window.cancelAnimationFrame(cleanup);
  }, []);

  const renderScreen = () => {
    switch (displayedTab) {
      case 'home':
        return <HomeScreen />;
      case 'community':
        return <CommunityScreen />;
      case 'scan':
        return <ScanScreen />;
      case 'meals':
        return <MealsScreen />;
      case 'profile':
        return <ProfileScreen onSignOut={handleSignOut} />;
      default:
        return <HomeScreen />;
    }
  };

  // Show email-confirmed success page (user clicked the confirmation link in their email)
  if (emailJustConfirmed && isAuthenticated) {
    // Clear the hash so refreshing doesn't re-trigger this screen
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch {}
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-8 px-6 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white">Alt i orden!</h1>
          <p className="text-zinc-400 text-sm max-w-xs">
            E-postadressen din er bekreftet. Du er klar til å bruke KaloriFit.
          </p>
        </div>
        <button
          onClick={() => setEmailJustConfirmed(false)}
          className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-2xl transition-colors"
        >
          Kom i gang
        </button>
      </div>
    );
  }

  // Show auth screen if Supabase is configured and user hasn't logged in or skipped
  if (isSupabaseConfigured() && !isAuthenticated && !skippedAuth && !authLoading) {
    return (
      <AuthScreen
        onAuth={handleAuth}
        onSkip={handleSkipAuth}
      />
    );
  }

  // Show loading screen during auth check
  if (isSupabaseConfigured() && authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-10">
        <div className="flex flex-col items-center gap-6">
          <div
            className="relative"
            style={{ animation: 'kf-logo-in 0.65s cubic-bezier(0.34,1.56,0.64,1) both' }}
          >
            <div className="absolute inset-0 rounded-3xl blur-2xl opacity-50 bg-orange-500 scale-125 pointer-events-none" />
            <img
              src="/icon-192x192.png"
              alt="KaloriFit"
              className="relative w-20 h-20 rounded-3xl shadow-2xl"
            />
          </div>
          <div
            className="text-center"
            style={{ animation: 'kf-rise 0.5s ease-out 0.4s both' }}
          >
            <h1 className="text-2xl font-black text-white tracking-tight">KaloriFit</h1>
            <p
              className="text-sm text-zinc-500 mt-1"
              style={{ animation: 'kf-fade 0.5s ease-out 0.65s both' }}
            >
              Din smarte kostholdsassistent
            </p>
          </div>
        </div>
        <div
          className="w-36 h-0.5 rounded-full relative overflow-hidden bg-white/[0.06]"
          style={{ animation: 'kf-fade 0.4s ease-out 0.8s both' }}
        >
          <div className="loading-bar absolute top-0 h-full w-2/5 bg-orange-500 rounded-full" />
        </div>
      </div>
    );
  }

  if (!onboardingCompleted) {
    return (
      <DatabaseProvider>
        <I18nProvider language={language}>
          <OnboardingScreen />
        </I18nProvider>
      </DatabaseProvider>
    );
  }

  return (
    <DatabaseProvider>
      <I18nProvider language={language}>
        <AppShell
          activeTab={activeTab}
          transitioning={transitioning}
          navigateTo={navigateTo}
          renderScreen={renderScreen}
        />
      </I18nProvider>
    </DatabaseProvider>
  );
}

function AppShell({
  activeTab,
  transitioning,
  navigateTo,
  renderScreen,
}: {
  activeTab: Tab;
  transitioning: boolean;
  navigateTo: (tab: Tab) => void;
  renderScreen: () => React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="app-container">
      <main className={`main-content${transitioning ? ' screen-exit' : ' screen-enter'}`}>
        {renderScreen()}
      </main>

      <nav className="bottom-nav">
        <div className="nav-pill-track">
          <button
            onClick={() => navigateTo('home')}
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          >
            <Home className="nav-icon" />
            <span className="nav-label">{t('nav.home')}</span>
          </button>

          <button
            onClick={() => navigateTo('community')}
            className={`nav-item ${activeTab === 'community' ? 'active' : ''}`}
          >
            <Users className="nav-icon" />
            <span className="nav-label">{t('nav.community')}</span>
          </button>

          <button
            onClick={() => navigateTo('scan')}
            className={`nav-item nav-item-center ${activeTab === 'scan' ? 'active' : ''}`}
          >
            <div className="scan-button">
              <Camera className="nav-icon-scan" />
            </div>
          </button>

          <button
            onClick={() => navigateTo('meals')}
            className={`nav-item ${activeTab === 'meals' ? 'active' : ''}`}
          >
            <UtensilsCrossed className="nav-icon" />
            <span className="nav-label">{t('nav.meals')}</span>
          </button>

          <button
            onClick={() => navigateTo('profile')}
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          >
            <User className="nav-icon" />
            <span className="nav-label">{t('nav.profile')}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export default App;
