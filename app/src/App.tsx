import React, { useEffect, useRef, useState } from 'react';
import { Home, Users, Camera, UtensilsCrossed, User } from 'lucide-react';
import HomeScreen from './components/screens/HomeScreen';
import CommunityScreen from './components/screens/CommunityScreen';
import ScanScreen from './components/screens/ScanScreen';
import MealsScreen from './components/screens/MealsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import OnboardingScreen from './components/screens/OnboardingScreen';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useLocalStorageState } from './hooks/useLocalStorageState';
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

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [transitioning, setTransitioning] = useState(false);
  const [displayedTab, setDisplayedTab] = useState<Tab>('home');
  const pendingTab = useRef<Tab | null>(null);
  useCurrentUser();
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
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  if (!onboardingCompleted) {
    return (
      <I18nProvider language={language}>
        <OnboardingScreen />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language}>
      <AppShell
        activeTab={activeTab}
        transitioning={transitioning}
        navigateTo={navigateTo}
        renderScreen={renderScreen}
      />
    </I18nProvider>
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
