import { useEffect, useRef, useState, useCallback } from 'react';
import { Home, Users, Camera, UtensilsCrossed, User } from 'lucide-react';
import HomeScreen from './components/screens/HomeScreen';
import CommunityScreen from './components/screens/CommunityScreen';
import ScanScreen from './components/screens/ScanScreen';
import MealsScreen from './components/screens/MealsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import XPFloatLayer from './components/ui/XPFloatLayer';
import LevelUpOverlay from './components/ui/LevelUpOverlay';
import AchievementUnlockPanel from './components/ui/AchievementUnlockPanel';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import {
  ensureWeeklyReportForSunday,
  type DayLog,
  type WeeklyPerformanceReport,
} from './lib/disciplineEngine';
import {
  ensureMonthlyIdentityReport,
  generateMonthlyIdentityReport,
  type IdentityReportsByMonth,
} from './lib/identityEngine';
import {
  checkNewBadges,
  type EarnedBadge,
} from './lib/achievementsEngine';
import './App.css';

type Tab = 'home' | 'community' | 'scan' | 'meals' | 'profile';
const TABS: Tab[] = ['home', 'community', 'scan', 'meals', 'profile'];

type LevelUpInfo = { level: number; label: string };

function getLevelLabel(level: number): string {
  if (level >= 20) return 'Elite';
  if (level >= 10) return 'Disciplined';
  if (level >= 5) return 'Consistent';
  return 'Starter';
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [screenKey, setScreenKey] = useState(0); // forces re-mount → screen-enter animation
  const swipeTouchRef = useRef<{ x: number; y: number } | null>(null);
  useCurrentUser();

  const [logsByDate] = useLocalStorageState<Record<string, DayLog>>('home.dailyLogs.v2', {});
  const [, setWeeklyReports] = useLocalStorageState<Record<string, WeeklyPerformanceReport>>(
    'home.weeklyReports.v1', {},
  );
  const [, setIdentityReports] = useLocalStorageState<IdentityReportsByMonth>(
    'home.identityReports.v1', {},
  );

  // ── Badge storage ────────────────────────────────────────────────────
  const [earnedBadges, setEarnedBadges] = useLocalStorageState<EarnedBadge[]>(
    'app.earnedBadges.v1', [],
  );
  const [badgeQueue, setBadgeQueue] = useState<EarnedBadge[]>([]);

  // ── Level tracking for level-up detection ───────────────────────────
  const [levelUpInfo, setLevelUpInfo] = useState<LevelUpInfo | null>(null);
  const prevLevelRef = useRef<number | null>(null);

  // ── Discipline / identity reports ───────────────────────────────────
  useEffect(() => {
    setWeeklyReports((prev) => ensureWeeklyReportForSunday(new Date(), logsByDate, prev));
  }, [logsByDate, setWeeklyReports]);

  useEffect(() => {
    setIdentityReports((prev) => ensureMonthlyIdentityReport(new Date(), logsByDate, prev));
  }, [logsByDate, setIdentityReports]);

  // ── Achievement + level-up checking ─────────────────────────────────
  useEffect(() => {
    if (Object.keys(logsByDate).length === 0) return;

    // Check for new badges
    const newBadges = checkNewBadges(logsByDate, earnedBadges);
    if (newBadges.length > 0) {
      setEarnedBadges((prev) => [...prev, ...newBadges]);
      setBadgeQueue((prev) => [...prev, ...newBadges]);
    }

    // Check for level up
    const report = generateMonthlyIdentityReport(logsByDate, new Date());
    const currentLevel = report.level.value;
    if (prevLevelRef.current !== null && currentLevel > prevLevelRef.current) {
      setLevelUpInfo({ level: currentLevel, label: getLevelLabel(currentLevel) });
    }
    prevLevelRef.current = currentLevel;
  }, [logsByDate, earnedBadges]);

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setScreenKey((k) => k + 1);
  }, [activeTab]);

  const onSwipeTouchStart = (e: React.TouchEvent) => {
    swipeTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onSwipeTouchEnd = (e: React.TouchEvent) => {
    const start = swipeTouchRef.current;
    swipeTouchRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Require a meaningful horizontal swipe that isn't mostly vertical
    if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.75) return;
    const currentIdx = TABS.indexOf(activeTab);
    if (dx < 0 && currentIdx < TABS.length - 1) handleTabChange(TABS[currentIdx + 1]);
    else if (dx > 0 && currentIdx > 0) handleTabChange(TABS[currentIdx - 1]);
  };

  const renderScreen = () => {
    switch (activeTab) {
      case 'home':      return <HomeScreen />;
      case 'community': return <CommunityScreen />;
      case 'scan':      return <ScanScreen />;
      case 'meals':     return <MealsScreen />;
      case 'profile':   return <ProfileScreen />;
      default:          return <HomeScreen />;
    }
  };

  return (
    <div className="app-container">
      {/* Main Content — key forces re-mount for enter animation */}
      <main
        className="main-content"
        onTouchStart={onSwipeTouchStart}
        onTouchEnd={onSwipeTouchEnd}
      >
        <div key={screenKey} className="screen-enter">
          {renderScreen()}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button
          onClick={() => handleTabChange('home')}
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        >
          <Home className="nav-icon" />
          <span className="nav-label">Hjem</span>
        </button>

        <button
          onClick={() => handleTabChange('community')}
          className={`nav-item ${activeTab === 'community' ? 'active' : ''}`}
        >
          <Users className="nav-icon" />
          <span className="nav-label">Community</span>
        </button>

        <button
          onClick={() => handleTabChange('scan')}
          className={`nav-item nav-item-center ${activeTab === 'scan' ? 'active' : ''}`}
        >
          <div className="scan-button">
            <Camera className="nav-icon" />
          </div>
          <span className="nav-label">Skann</span>
        </button>

        <button
          onClick={() => handleTabChange('meals')}
          className={`nav-item ${activeTab === 'meals' ? 'active' : ''}`}
        >
          <UtensilsCrossed className="nav-icon" />
          <span className="nav-label">Måltider</span>
        </button>

        <button
          onClick={() => handleTabChange('profile')}
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <User className="nav-icon" />
          <span className="nav-label">Profil</span>
        </button>
      </nav>

      {/* ── Gamification Overlays ── */}
      <XPFloatLayer />

      {levelUpInfo && (
        <LevelUpOverlay
          level={levelUpInfo.level}
          label={levelUpInfo.label}
          onDismiss={() => setLevelUpInfo(null)}
        />
      )}

      {badgeQueue.length > 0 && (
        <AchievementUnlockPanel
          queue={badgeQueue}
          onShift={() => setBadgeQueue((prev) => prev.slice(1))}
        />
      )}
    </div>
  );
}

export default App;
