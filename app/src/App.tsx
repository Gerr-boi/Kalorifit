import { useEffect, useState } from 'react';
import { Home, Users, Camera, UtensilsCrossed, User } from 'lucide-react';
import HomeScreen from './components/screens/HomeScreen';
import CommunityScreen from './components/screens/CommunityScreen';
import ScanScreen from './components/screens/ScanScreen';
import MealsScreen from './components/screens/MealsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import {
  ensureWeeklyReportForSunday,
  type DayLog,
  type WeeklyPerformanceReport,
} from './lib/disciplineEngine';
import {
  ensureMonthlyIdentityReport,
  type IdentityReportsByMonth,
} from './lib/identityEngine';
import './App.css';

type Tab = 'home' | 'community' | 'scan' | 'meals' | 'profile';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');

  useEffect(() => {
    const runAutomations = () => {
      try {
        const logsRaw = localStorage.getItem('home.dailyLogs.v2');
        const reportsRaw = localStorage.getItem('home.weeklyReports.v1');
        const identityRaw = localStorage.getItem('home.identityReports.v1');
        const logsByDate: Record<string, DayLog> = logsRaw ? (JSON.parse(logsRaw) as Record<string, DayLog>) : {};
        const reportsByWeek: Record<string, WeeklyPerformanceReport> = reportsRaw
          ? (JSON.parse(reportsRaw) as Record<string, WeeklyPerformanceReport>)
          : {};
        const identityByMonth: IdentityReportsByMonth = identityRaw
          ? (JSON.parse(identityRaw) as IdentityReportsByMonth)
          : {};

        const nextReports = ensureWeeklyReportForSunday(new Date(), logsByDate, reportsByWeek);
        if (nextReports !== reportsByWeek) {
          localStorage.setItem('home.weeklyReports.v1', JSON.stringify(nextReports));
        }

        const nextIdentityReports = ensureMonthlyIdentityReport(new Date(), logsByDate, identityByMonth);
        if (nextIdentityReports !== identityByMonth) {
          localStorage.setItem('home.identityReports.v1', JSON.stringify(nextIdentityReports));
        }
      } catch {
        // Ignore malformed local storage payloads.
      }
    };

    runAutomations();
    const interval = window.setInterval(runAutomations, 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);

  const renderScreen = () => {
    switch (activeTab) {
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

  return (
    <div className="app-container">
      {/* Main Content */}
      <main className="main-content">
        {renderScreen()}
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button
          onClick={() => setActiveTab('home')}
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        >
          <Home className="nav-icon" />
          <span className="nav-label">Hjem</span>
        </button>
        
        <button
          onClick={() => setActiveTab('community')}
          className={`nav-item ${activeTab === 'community' ? 'active' : ''}`}
        >
          <Users className="nav-icon" />
          <span className="nav-label">Community</span>
        </button>
        
        <button
          onClick={() => setActiveTab('scan')}
          className={`nav-item nav-item-center ${activeTab === 'scan' ? 'active' : ''}`}
        >
          <div className="scan-button">
            <Camera className="nav-icon" />
          </div>
          <span className="nav-label">Skann</span>
        </button>
        
        <button
          onClick={() => setActiveTab('meals')}
          className={`nav-item ${activeTab === 'meals' ? 'active' : ''}`}
        >
          <UtensilsCrossed className="nav-icon" />
          <span className="nav-label">Måltider</span>
        </button>
        
        <button
          onClick={() => setActiveTab('profile')}
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        >
          <User className="nav-icon" />
          <span className="nav-label">Profil</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
