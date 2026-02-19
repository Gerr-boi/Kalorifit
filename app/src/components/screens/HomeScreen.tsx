import { useState, useEffect } from 'react';
import { Camera, Plus, ChevronRight, Flame } from 'lucide-react';

interface Meal {
  id: string;
  name: string;
  icon: string;
  color: string;
  calories: number;
  recommended: number;
  items: string[];
}

const meals: Meal[] = [
  {
    id: 'breakfast',
    name: 'Frokost',
    icon: '🍳',
    color: '#fef3c7',
    calories: 0,
    recommended: 500,
    items: []
  },
  {
    id: 'lunch',
    name: 'Lunsj',
    icon: '🥗',
    color: '#dcfce7',
    calories: 0,
    recommended: 600,
    items: []
  },
  {
    id: 'dinner',
    name: 'Middag',
    icon: '🍽️',
    color: '#dbeafe',
    calories: 0,
    recommended: 700,
    items: []
  },
  {
    id: 'snacks',
    name: 'Snacks',
    icon: '🍎',
    color: '#fce7f3',
    calories: 0,
    recommended: 200,
    items: []
  }
];

export default function HomeScreen() {
  const [caloriesRemaining, setCaloriesRemaining] = useState(2000);
  const [calorieGoal] = useState(2000);
  const [consumed, setConsumed] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [streak] = useState(26);

  useEffect(() => {
    // Check if goal reached
    if (caloriesRemaining <= 0 && !showPopup) {
      setShowPopup(true);
    }
  }, [caloriesRemaining]);

  const addCalories = (_mealId: string, amount: number) => {
    setConsumed(prev => prev + amount);
    setCaloriesRemaining(prev => Math.max(0, prev - amount));
  };

  const progress = ((calorieGoal - caloriesRemaining) / calorieGoal) * 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="screen">
      {/* Header with Progress */}
      <div className="screen-header">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <span className="text-white/80 text-sm">{streak} dagers streak</span>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-white">⚡</span>
          </div>
        </div>

        {/* Progress Circle */}
        <div className="progress-circle">
          <svg width="200" height="200" viewBox="0 0 200 200">
            <circle
              className="progress-circle-bg"
              cx="100"
              cy="100"
              r="90"
            />
            <circle
              className="progress-circle-fill"
              cx="100"
              cy="100"
              r="90"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="progress-text">
            <p className="text-5xl font-bold text-white">{caloriesRemaining}</p>
            <p className="text-white/70 text-sm mt-1">KALORIER IGJEN</p>
            <button className="mt-2 text-white/80 text-xs flex items-center gap-1 mx-auto">
              Mer <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex justify-around mt-6 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{calorieGoal}</p>
            <p className="text-white/60 text-xs">BUDSJETT</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{consumed}</p>
            <p className="text-white/60 text-xs">SPIST</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">+0</p>
            <p className="text-white/60 text-xs">TRENING</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{caloriesRemaining}</p>
            <p className="text-white/60 text-xs">IGJEN</p>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-center gap-4 py-4">
        <button className="text-gray-400">{'<'}</button>
        <p className="text-gray-600 font-medium">I dag, 18. februar 2026</p>
        <button className="text-gray-400">{'>'}</button>
      </div>

      {/* Meal List */}
      <div className="space-y-3 pb-24">
        {meals.map((meal) => (
          <div key={meal.id} className="meal-item">
            <div className="meal-info">
              <div 
                className="meal-icon"
                style={{ background: meal.color }}
              >
                {meal.icon}
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Legg til {meal.name}</h3>
                <p className="text-sm text-gray-500">Anbefalt: {meal.recommended} kcal</p>
                {meal.items.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {meal.items.join(', ')}
                  </p>
                )}
              </div>
            </div>
            <div className="meal-actions">
              <button 
                className="action-btn"
                onClick={() => addCalories(meal.id, 100)}
              >
                <Camera className="w-4 h-4" />
              </button>
              <button 
                className="action-btn"
                onClick={() => addCalories(meal.id, meal.recommended)}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Workout Logging */}
      <div className="card mt-4">
        <button className="w-full flex items-center justify-center gap-3 p-4 text-orange-500 font-medium hover:bg-orange-50 transition-colors rounded-lg">
          <span className="text-2xl">💪</span>
          <span>Logg treningsøkt</span>
        </button>
      </div>

      {/* Goal Reached Popup */}
      {showPopup && (
        <div className="popup-overlay" onClick={() => setShowPopup(false)}>
          <div className="popup">
            <div className="popup-icon">🎉</div>
            <h3 className="popup-title">MÅL NÅDD!</h3>
            <p className="popup-text">
              Du har nådd ditt daglige kalorimål! Bra jobba!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
