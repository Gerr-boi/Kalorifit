import { useState } from 'react';
import { Search, Camera, Barcode, X, Check, Loader2 } from 'lucide-react';

type ScanMode = 'search' | 'photo' | 'barcode';

interface ScannedFood {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  image?: string;
}

export default function ScanScreen() {
  const [mode, setMode] = useState<ScanMode>('photo');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFood, setScannedFood] = useState<ScannedFood | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleScan = async () => {
    setIsScanning(true);
    
    // Simulate AI scanning
    setTimeout(() => {
      setScannedFood({
        name: 'Grillet kylling med ris',
        calories: 450,
        protein: 35,
        carbs: 50,
        fat: 8,
        confidence: 94,
        image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=300&fit=crop'
      });
      setIsScanning(false);
    }, 2000);
  };

  const clearScan = () => {
    setScannedFood(null);
  };

  const addToLog = () => {
    alert(`${scannedFood?.name} lagt til i dagboken!`);
    clearScan();
  };

  return (
    <div className="screen">
      {!scannedFood ? (
        <div className="camera-container">
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
                <span className="text-2xl">👩‍🦰</span>
                <span className="text-white font-medium">26 Day Streak</span>
                <span className="text-white/60">{'>'}</span>
              </div>
              <button className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">⚡</span>
              </button>
            </div>
          </div>

          {/* Camera Preview */}
          <div className="camera-preview">
            <div className="camera-frame">
              {/* Corner markers */}
              <div className="absolute -top-1 -left-1 w-8 h-8 border-l-4 border-t-4 border-orange-500 rounded-tl-xl" />
              <div className="absolute -top-1 -right-1 w-8 h-8 border-r-4 border-t-4 border-orange-500 rounded-tr-xl" />
              <div className="absolute -bottom-1 -left-1 w-8 h-8 border-l-4 border-b-4 border-orange-500 rounded-bl-xl" />
              <div className="absolute -bottom-1 -right-1 w-8 h-8 border-r-4 border-b-4 border-orange-500 rounded-br-xl" />
            </div>

            {/* Scanning Animation */}
            {isScanning && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-72 h-72 border-2 border-orange-500/50 rounded-2xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500 animate-scan" />
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="camera-controls">
            {/* Mode Switcher */}
            <div className="camera-modes">
              <button
                onClick={() => setMode('search')}
                className={`camera-mode ${mode === 'search' ? 'active' : ''}`}
              >
                <Search className="w-4 h-4 inline mr-1" />
                SØK
              </button>
              <button
                onClick={() => setMode('photo')}
                className={`camera-mode ${mode === 'search' ? 'active' : ''}`}
              >
                <Camera className="w-4 h-4 inline mr-1" />
                FOTO
              </button>
              <button
                onClick={() => setMode('barcode')}
                className={`camera-mode ${mode === 'barcode' ? 'active' : ''}`}
              >
                <Barcode className="w-4 h-4 inline mr-1" />
                STREKKODE
              </button>
            </div>

            {/* Search Input (when in search mode) */}
            {mode === 'search' && (
              <div className="w-full px-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Søk etter matvare..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/10 rounded-full text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            )}

            {/* Shutter Button */}
            <button 
              onClick={handleScan}
              disabled={isScanning}
              className="shutter-button disabled:opacity-50"
            >
              {isScanning && (
                <Loader2 className="absolute inset-0 m-auto w-8 h-8 text-orange-500 animate-spin z-10" />
              )}
            </button>

            {/* Recent Photos */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white">
                <img 
                  src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100&h=100&fit=crop" 
                  alt="Recent" 
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Results Screen */
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <div className="bg-white p-4 flex items-center justify-between">
            <button onClick={clearScan} className="p-2">
              <X className="w-6 h-6 text-gray-600" />
            </button>
            <h2 className="font-semibold text-gray-800">Gjenkjent mat</h2>
            <div className="w-10" />
          </div>

          {/* Food Image */}
          <div className="relative">
            <img 
              src={scannedFood.image} 
              alt={scannedFood.name}
              className="w-full h-64 object-cover"
            />
            <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
              {scannedFood.confidence}% sikkerhet
            </div>
          </div>

          {/* Food Details */}
          <div className="p-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">{scannedFood.name}</h1>

            {/* Nutrition Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white rounded-xl p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-gray-800">{scannedFood.calories}</p>
                <p className="text-sm text-gray-500">kcal</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{scannedFood.protein}g</p>
                <p className="text-sm text-blue-500">protein</p>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{scannedFood.carbs}g</p>
                <p className="text-sm text-green-500">karbo</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-orange-600">{scannedFood.fat}g</p>
                <p className="text-sm text-orange-500">fett</p>
              </div>
            </div>

            {/* Add Button */}
            <button 
              onClick={addToLog}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Legg til i dagbok
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(288px); }
        }
        .animate-scan {
          animation: scan 2s linear infinite;
        }
      `}</style>
    </div>
  );
}
