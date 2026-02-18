import { useState } from 'react';
import { Settings, ChevronRight, Bell, Shield, Moon, Globe, HelpCircle, LogOut, Activity } from 'lucide-react';

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
  { id: 'notifications', icon: Bell, label: 'Varsler', value: 'På' },
  { id: 'privacy', icon: Shield, label: 'Personvern', value: '' },
  { id: 'darkmode', icon: Moon, label: 'Mørk modus', value: 'Av' },
  { id: 'language', icon: Globe, label: 'Språk', value: 'Norsk' },
  { id: 'bmi', icon: Activity, label: 'BMI-kalkulator', value: '' },
  { id: 'help', icon: HelpCircle, label: 'Hjelp og støtte', value: '' },
];

export default function ProfileScreen() {

  const [showBmi, setShowBmi] = useState(false);
  const [heightCm, setHeightCm] = useState<string>('170');
  const [weightKg, setWeightKg] = useState<string>('70');

  const toNumber = (s: string) => {
    const n = Number(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  };

  const bmi = (() => {
    const hCm = toNumber(heightCm);
    const wKg = toNumber(weightKg);
    if (!hCm || !wKg || hCm <= 0 || wKg <= 0) return null;
    const hM = hCm / 100;
    return wKg / (hM * hM);
  })();

  const bmiCategory = (b: number) => {
    if (b < 18.5) return 'Undervekt';
    if (b < 25) return 'Normal';
    if (b < 30) return 'Overvekt';
    return 'Fedme';
  };

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
            onClick={() => {
              if (item.id === 'bmi') setShowBmi(true);
            }}
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

      {showBmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 -mt-24">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">BMI-kalkulator</h3>
              <button
                onClick={() => setShowBmi(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600">Høyde (cm)</label>
                <input
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="f.eks. 180"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600">Vekt (kg)</label>
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="f.eks. 82"
                />
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                {bmi === null ? (
                  <p className="text-sm text-gray-600">Skriv inn høyde og vekt for å beregne BMI.</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Din BMI</p>
                      <p className="text-2xl font-bold text-gray-800">{bmi.toFixed(1)}</p>
                      <p className="text-sm text-gray-600">{bmiCategory(bmi)}</p>
                    </div>
                    <button
                      onClick={() => {
                        // TODO: save to user profile / backend / localStorage
                        setShowBmi(false);
                      }}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
                    >
                      Lagre
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500">
                Tips: For bedre kaloriberegning bør du også lagre aktivitetsnivå og mål (ned/opp/vedlikehold).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Version */}
      <p className="text-center text-sm text-gray-400 mt-4 pb-8">
        KaloriFit v1.0.0
      </p>
    </div>
  );
}
