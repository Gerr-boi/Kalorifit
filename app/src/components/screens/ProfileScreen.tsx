import { useEffect, useRef, useState } from 'react';
import { Settings, ChevronRight, Bell, Shield, Moon, Globe, HelpCircle, LogOut, Activity, ArrowLeft } from 'lucide-react';
import { useLocalStorageState } from '../../hooks/useLocalStorageState';

type BmiEntry = { date: string; bmi: number; weightKg: number; heightCm: number };

type Profile = {
  name: string;
  memberSince: string;
  heightCm: number;
  weightKg: number;
  bmiHistory: BmiEntry[];
  profileImageDataUrl?: string | null;
  notificationsEnabled: boolean;
  privacyMode: 'Standard' | 'Privat';
  language: 'Norsk' | 'English';
};

const DEFAULT_PROFILE: Profile = {
  name: 'Anna Hansen',
  memberSince: '2024',
  heightCm: 170,
  weightKg: 70,
  bmiHistory: [],
  profileImageDataUrl: null,
  notificationsEnabled: true,
  privacyMode: 'Standard',
  language: 'Norsk',
};

interface Stat {
  label: string;
  value: string;
  color: string;
}

const stats: Stat[] = [
  { label: 'Dager', value: '26', color: 'text-orange-500' },
  { label: 'Maltider', value: '312', color: 'text-blue-500' },
  { label: 'Kalorier', value: '156k', color: 'text-green-500' },
];

export default function ProfileScreen() {
  const [profile, setProfile] = useLocalStorageState<Profile>('profile', DEFAULT_PROFILE);
  const [showBmi, setShowBmi] = useState(false);
  const [showPersonalSettings, setShowPersonalSettings] = useState(false);
  const [heightCm, setHeightCm] = useState<string>(String(profile.heightCm));
  const [weightKg, setWeightKg] = useState<string>(String(profile.weightKg));
  const [draftName, setDraftName] = useState(profile.name);
  const [draftMemberSince, setDraftMemberSince] = useState(profile.memberSince);
  const [draftProfileImage, setDraftProfileImage] = useState<string | null>(profile.profileImageDataUrl ?? null);
  const [darkMode, setDarkMode] = useLocalStorageState<boolean>('darkMode', false);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const toggleNotifications = () => {
    setProfile((prev) => ({
      ...prev,
      notificationsEnabled: !prev.notificationsEnabled,
    }));
  };

  const togglePrivacyMode = () => {
    setProfile((prev) => ({
      ...prev,
      privacyMode: prev.privacyMode === 'Standard' ? 'Privat' : 'Standard',
    }));
  };

  const toggleLanguage = () => {
    setProfile((prev) => ({
      ...prev,
      language: prev.language === 'Norsk' ? 'English' : 'Norsk',
    }));
  };

  const openPersonalSettings = () => {
    setDraftName(profile.name);
    setDraftMemberSince(profile.memberSince);
    setDraftProfileImage(profile.profileImageDataUrl ?? null);
    setShowPersonalSettings(true);
  };

  const savePersonalSettings = () => {
    const nextName = draftName.trim();
    const nextMemberSince = draftMemberSince.trim();
    if (!nextName || !nextMemberSince) return;

    setProfile((prev) => ({
      ...prev,
      name: nextName,
      memberSince: nextMemberSince,
      profileImageDataUrl: draftProfileImage,
    }));
    setShowPersonalSettings(false);
  };

  const onPickProfileImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      setDraftProfileImage(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveBmi = () => {
    if (bmi === null) return;

    const hCm = toNumber(heightCm);
    const wKg = toNumber(weightKg);
    if (!hCm || !wKg || hCm <= 0 || wKg <= 0) return;

    const entry: BmiEntry = {
      date: new Date().toISOString().slice(0, 10),
      bmi: Number(bmi.toFixed(1)),
      weightKg: Number(wKg.toFixed(1)),
      heightCm: Number(hCm.toFixed(1)),
    };

    setProfile((prev) => ({
      ...prev,
      heightCm: entry.heightCm,
      weightKg: entry.weightKg,
      bmiHistory: [entry, ...prev.bmiHistory].slice(0, 20),
    }));

    setShowBmi(false);
  };

  const getMenuItems = () => [
    { id: 'notifications', icon: Bell, label: 'Varsler', value: profile.notificationsEnabled ? 'Pa' : 'Av' },
    { id: 'privacy', icon: Shield, label: 'Personvern', value: profile.privacyMode },
    { id: 'darkmode', icon: Moon, label: 'Mork modus', value: darkMode ? 'Pa' : 'Av' },
    { id: 'language', icon: Globe, label: 'Sprak', value: profile.language },
    { id: 'bmi', icon: Activity, label: 'BMI-kalkulator', value: '' },
    { id: 'help', icon: HelpCircle, label: 'Hjelp og stotte', value: '' },
  ];

  const initials = profile.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  if (showPersonalSettings) {
    return (
      <div className="screen min-h-screen bg-white dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setShowPersonalSettings(false)}
            className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
            title="Tilbake"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          </button>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Personlig info</h3>
        </div>

        <div className="p-4 space-y-4">
          <div className="card dark:bg-gray-800 dark:border-gray-700 m-0">
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Profilbilde</label>
                <div className="mt-2 flex items-center gap-3">
                  {draftProfileImage ? (
                    <img
                      src={draftProfileImage}
                      alt="Profilbilde"
                      className="w-16 h-16 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-lg font-semibold text-gray-600 dark:text-gray-200">
                      {initials || 'U'}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => profileImageInputRef.current?.click()}
                      className="rounded-xl bg-orange-500 px-3 py-2 text-white text-sm font-medium"
                    >
                      Velg bilde
                    </button>
                    {draftProfileImage && (
                      <button
                        onClick={() => setDraftProfileImage(null)}
                        className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-3 py-2 text-sm font-medium"
                      >
                        Fjern
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={profileImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickProfileImage}
                  className="hidden"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Navn</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. Anna Hansen"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Medlem siden</label>
                <input
                  value={draftMemberSince}
                  onChange={(e) => setDraftMemberSince(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 2024"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowPersonalSettings(false)}
              className="rounded-xl bg-gray-100 dark:bg-gray-600 dark:text-gray-100 px-4 py-2 font-medium"
            >
              Avbryt
            </button>
            <button
              onClick={savePersonalSettings}
              className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
            >
              Lagre
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="profile-header">
        <div className="flex justify-end mb-4">
          <button
            onClick={openPersonalSettings}
            className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
            title="Rediger profil"
          >
            <Settings className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            {profile.profileImageDataUrl ? (
              <img
                src={profile.profileImageDataUrl}
                alt={profile.name}
                className="w-24 h-24 rounded-full object-cover mb-4 border-4 border-white/30 bg-white"
              />
            ) : (
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center text-5xl mb-4 border-4 border-white/30">
                {initials || 'U'}
              </div>
            )}
            <div className="absolute bottom-4 right-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-white">
              OK
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-1">{profile.name}</h2>
          <p className="text-white/70">Medlem siden {profile.memberSince}</p>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card dark:bg-gray-800 dark:border-gray-700">
            <p className={`stat-value ${stat.color}`}>{stat.value}</p>
            <p className="stat-label dark:text-gray-300">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="card mt-4 dark:bg-gray-800 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 mb-4 dark:text-gray-200">Daglige mal</h3>

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

      <div className="card mt-4 p-0 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        {getMenuItems().map((item, index) => (
          <button
            key={index}
            onClick={() => {
              if (item.id === 'bmi') setShowBmi(true);
              if (item.id === 'darkmode') toggleDarkMode();
              if (item.id === 'notifications') toggleNotifications();
              if (item.id === 'privacy') togglePrivacyMode();
              if (item.id === 'language') toggleLanguage();
            }}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 dark:border-gray-600"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-600 rounded-full flex items-center justify-center">
                <item.icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.value && (
                <span className="text-sm text-gray-500 dark:text-gray-400">{item.value}</span>
              )}
              <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
          </button>
        ))}
      </div>

      <button className="w-full flex items-center justify-center gap-2 p-4 mt-4 text-red-500 font-medium">
        <LogOut className="w-5 h-5" />
        Logg ut
      </button>

      {showBmi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 -mt-24">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">BMI-kalkulator</h3>
              <button
                onClick={() => setShowBmi(false)}
                className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-600 flex items-center justify-center"
              >
                x
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Hoyde (cm)</label>
                <input
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 180"
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">Vekt (kg)</label>
                <input
                  inputMode="decimal"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-200 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="f.eks. 82"
                />
              </div>

              <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                {bmi === null ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">Skriv inn hoyde og vekt for a beregne BMI.</p>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Din BMI</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">{bmi.toFixed(1)}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{bmiCategory(bmi)}</p>
                    </div>
                    <button
                      onClick={saveBmi}
                      className="rounded-xl bg-orange-500 px-4 py-2 text-white font-medium"
                    >
                      Lagre
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-500">
                Tips: For bedre kaloriberegning bor du ogsa lagre aktivitetsniva og mal (ned/opp/vedlikehold).
              </p>

              {profile.bmiHistory.length > 0 && (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-700 p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Siste BMI-logg</p>
                  <div className="space-y-1">
                    {profile.bmiHistory.slice(0, 3).map((entry) => (
                      <p key={`${entry.date}-${entry.bmi}`} className="text-xs text-gray-600 dark:text-gray-300">
                        {entry.date}: BMI {entry.bmi} ({entry.weightKg} kg, {entry.heightCm} cm)
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-sm text-gray-400 mt-4 pb-8">
        KaloriFit v1.0.0
      </p>
    </div>
  );
}
