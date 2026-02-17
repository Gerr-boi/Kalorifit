import { useState } from 'react';
import { Settings, ChevronRight, Bell, Shield, Moon, Globe, HelpCircle, LogOut } from 'lucide-react';

interface Stat {
  label: string;
  value: string;
  color: string;
}

const stats: Stat[] = [
  { label: 'Dager', value: '26', color: 'text-orange-500' },
  { label: 'Måltider', value: '312', color: 'text-blue-500' },
  { label: 'Kalorier', value: '156k', color: 'text-green-500' },
];

const menuItems = [
  { icon: Bell, label: 'Varsler', value: 'På' },
  { icon: Shield, label: 'Personvern', value: '' },
  { icon: Moon, label: 'Mørk modus', value: 'Av' },
  { icon: Globe, label: 'Språk', value: 'Norsk' },
  { icon: HelpCircle, label: 'Hjelp og støtte', value: '' },
];

export default function ProfileScreen() {
  const [_darkMode, _setDarkMode] = useState(false);

  return (
    <div className="screen">
      {/* Profile Header */}
      <div className="profile-header">
        <div className="flex justify-end mb-4">
          <button className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <Settings className="w-5 h-5 text-white" />
          </button>
        </div>
        
        <div className="flex flex-col items-center">
          <div className="relative">
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-5xl mb-4 border-4 border-white/30">
              👩‍🦰
            </div>
            <div className="absolute bottom-4 right-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-white">
              ✓
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-1">Anna Hansen</h2>
          <p className="text-white/70">Medlem siden 2024</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <p className={`stat-value ${stat.color}`}>{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Goals Section */}
      <div className="card mt-4">
        <h3 className="font-semibold text-gray-800 mb-4">Daglige mål</h3>
        
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Kalorier</span>
              <span className="text-sm font-medium text-gray-800">2000 kcal</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full" style={{ width: '75%' }} />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Protein</span>
              <span className="text-sm font-medium text-gray-800">150g</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: '60%' }} />
            </div>
          </div>
          
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-600">Vann</span>
              <span className="text-sm font-medium text-gray-800">2.5L</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: '80%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="card mt-4 p-0 overflow-hidden">
        {menuItems.map((item, index) => (
          <button
            key={index}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                <item.icon className="w-5 h-5 text-gray-600" />
              </div>
              <span className="font-medium text-gray-700">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.value && (
                <span className="text-sm text-gray-500">{item.value}</span>
              )}
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </button>
        ))}
      </div>

      {/* Logout */}
      <button className="w-full flex items-center justify-center gap-2 p-4 mt-4 text-red-500 font-medium">
        <LogOut className="w-5 h-5" />
        Logg ut
      </button>

      {/* Version */}
      <p className="text-center text-sm text-gray-400 mt-4 pb-8">
        KaloriFit v1.0.0
      </p>
    </div>
  );
}
