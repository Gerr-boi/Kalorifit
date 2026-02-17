import { useState } from 'react';
import { Home, Users, Camera, UtensilsCrossed, User } from 'lucide-react';
import HomeScreen from './components/screens/HomeScreen';
import CommunityScreen from './components/screens/CommunityScreen';
import ScanScreen from './components/screens/ScanScreen';
import MealsScreen from './components/screens/MealsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import './App.css';

type Tab = 'home' | 'community' | 'scan' | 'meals' | 'profile';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');

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
