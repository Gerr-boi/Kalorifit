import { useState } from 'react';
import { Star, Clock, Flame, ChefHat, Users } from 'lucide-react';

interface Recipe {
  id: string;
  title: string;
  image: string;
  category: string;
  calories: number;
  time: string;
  rating: number;
  reviews: number;
  tags: string[];
  isFavorite?: boolean;
  source: string;
  servings: number;
  difficulty: string;
}

// Real Norwegian recipes from Rema 1000, Meny, Coop, Kiwi
const recipes: Recipe[] = [
  // FROKOST
  {
    id: '1',
    title: 'Amerikanske pannekaker med bacon',
    image: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop',
    category: 'FROKOST',
    calories: 420,
    time: '20 min',
    rating: 4.3,
    reviews: 622,
    tags: ['Enkel', 'Klassiker'],
    isFavorite: true,
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '2',
    title: 'Cottage Cheese Pannekaker med Bær',
    image: 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=400&h=300&fit=crop',
    category: 'FROKOST',
    calories: 280,
    time: '15 min',
    rating: 4.7,
    reviews: 156,
    tags: ['Høyt protein', 'Sunn'],
    source: 'Meny',
    servings: 2,
    difficulty: 'Enkel'
  },
  {
    id: '3',
    title: 'Havregrøt med Blåbær og Honning',
    image: 'https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&h=300&fit=crop',
    category: 'FROKOST',
    calories: 320,
    time: '10 min',
    rating: 4.5,
    reviews: 89,
    tags: ['Fiberrik', 'Varm'],
    source: 'Coop Mega',
    servings: 1,
    difficulty: 'Enkel'
  },
  {
    id: '4',
    title: 'Egg og Bacon Wrap med Spinat',
    image: 'https://images.unsplash.com/photo-1525351484163-7529414395d8?w=400&h=300&fit=crop',
    category: 'FROKOST',
    calories: 350,
    time: '10 min',
    rating: 4.4,
    reviews: 234,
    tags: ['Keto', 'Rask'],
    source: 'KIWI',
    servings: 1,
    difficulty: 'Enkel'
  },
  {
    id: '5',
    title: 'Grove Vafler med Rømme',
    image: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=400&h=300&fit=crop',
    category: 'FROKOST',
    calories: 380,
    time: '25 min',
    rating: 4.6,
    reviews: 445,
    tags: ['Klassiker', 'Barnevennlig'],
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Middels'
  },
  
  // LUNSJ
  {
    id: '6',
    title: 'Kyllingsalat med Avocado og Quinoa',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop',
    category: 'LUNSJ',
    calories: 380,
    time: '15 min',
    rating: 4.6,
    reviews: 312,
    tags: ['Høyt protein', 'Fiberrikt'],
    source: 'Meny',
    servings: 2,
    difficulty: 'Enkel'
  },
  {
    id: '7',
    title: 'Quesadilla med Kylling',
    image: 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&h=300&fit=crop',
    category: 'LUNSJ',
    calories: 450,
    time: '20 min',
    rating: 4.5,
    reviews: 178,
    tags: ['Meksikansk', 'Rask'],
    source: 'KIWI',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '8',
    title: 'Laksesmørbrød med Agurk',
    image: 'https://images.unsplash.com/photo-1481070414801-51fd732d7184?w=400&h=300&fit=crop',
    category: 'LUNSJ',
    calories: 320,
    time: '10 min',
    rating: 4.7,
    reviews: 89,
    tags: ['Norsk', 'Omega-3'],
    source: 'Coop Mega',
    servings: 1,
    difficulty: 'Enkel'
  },
  {
    id: '9',
    title: 'Grove Horn med Ost og Skinke',
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&h=300&fit=crop',
    category: 'LUNSJ',
    calories: 280,
    time: '40 min',
    rating: 4.4,
    reviews: 567,
    tags: ['Matpakke', 'Bakst'],
    source: 'Meny',
    servings: 12,
    difficulty: 'Middels'
  },
  
  // MIDDAG
  {
    id: '10',
    title: 'Grillet Laks med Asparges',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 450,
    time: '25 min',
    rating: 4.9,
    reviews: 892,
    tags: ['Omega-3', 'Keto'],
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '11',
    title: 'Butter Chicken med Naan',
    image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 580,
    time: '35 min',
    rating: 4.8,
    reviews: 445,
    tags: ['Indisk', 'Kremet'],
    source: 'Meny',
    servings: 4,
    difficulty: 'Middels'
  },
  {
    id: '12',
    title: 'Pasta Carbonara',
    image: 'https://images.unsplash.com/photo-1612874742237-6526221588e3?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 520,
    time: '15 min',
    rating: 4.7,
    reviews: 1023,
    tags: ['Italiensk', 'Rask'],
    source: 'Coop Mega',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '13',
    title: 'Taco med Ørret',
    image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 420,
    time: '20 min',
    rating: 4.5,
    reviews: 234,
    tags: ['Norsk twist', 'Fredag'],
    source: 'KIWI',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '14',
    title: 'Biff med Søtpotet Fries',
    image: 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 550,
    time: '35 min',
    rating: 4.7,
    reviews: 678,
    tags: ['Høyt protein', 'Helg'],
    source: 'Meny',
    servings: 2,
    difficulty: 'Middels'
  },
  {
    id: '15',
    title: 'Vegetarisk Høstgryte',
    image: 'https://images.unsplash.com/photo-1547592166-23acbe346499?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 380,
    time: '45 min',
    rating: 4.4,
    reviews: 156,
    tags: ['Vegetar', 'Sesong'],
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '16',
    title: 'Pølsegrateng med Pasta',
    image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 480,
    time: '30 min',
    rating: 4.3,
    reviews: 789,
    tags: ['Barnevennlig', 'Klassiker'],
    source: 'Coop Mega',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '17',
    title: 'Teriyaki med Laks',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 420,
    time: '20 min',
    rating: 4.6,
    reviews: 334,
    tags: ['Asiatisk', 'Rask'],
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '18',
    title: 'Kylling Tikka Masala',
    image: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=300&fit=crop',
    category: 'MIDDAG',
    calories: 520,
    time: '40 min',
    rating: 4.8,
    reviews: 556,
    tags: ['Indisk', 'Kremet'],
    source: 'Meny',
    servings: 4,
    difficulty: 'Middels'
  },
  
  // SNACKS
  {
    id: '19',
    title: 'Gresk Yoghurt med Nøtter',
    image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&h=300&fit=crop',
    category: 'SNACKS',
    calories: 180,
    time: '5 min',
    rating: 4.4,
    reviews: 123,
    tags: ['Proteinrik', 'Rask'],
    source: 'KIWI',
    servings: 1,
    difficulty: 'Enkel'
  },
  {
    id: '20',
    title: 'Smoothie Bowl med Bær',
    image: 'https://images.unsplash.com/photo-1626078436812-e7218a8ee344?w=400&h=300&fit=crop',
    category: 'SNACKS',
    calories: 220,
    time: '10 min',
    rating: 4.6,
    reviews: 89,
    tags: ['Sunn', 'Frisk'],
    source: 'Meny',
    servings: 1,
    difficulty: 'Enkel'
  },
  {
    id: '21',
    title: 'Ovnsbakte Kikerter',
    image: 'https://images.unsplash.com/photo-1591782519998-6f1b5d709c89?w=400&h=300&fit=crop',
    category: 'SNACKS',
    calories: 150,
    time: '25 min',
    rating: 4.3,
    reviews: 67,
    tags: ['Sprø', 'Fiberrik'],
    source: 'REMA 1000',
    servings: 2,
    difficulty: 'Enkel'
  },
  
  // KETO
  {
    id: '22',
    title: 'Keto Pizza med Blomkålbunn',
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400&h=300&fit=crop',
    category: 'KETO',
    calories: 380,
    time: '35 min',
    rating: 4.5,
    reviews: 234,
    tags: ['Lavkarbo', 'Glutenfri'],
    source: 'Meny',
    servings: 2,
    difficulty: 'Middels'
  },
  {
    id: '23',
    title: 'Stekt Kylling med Blomkålris',
    image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=300&fit=crop',
    category: 'KETO',
    calories: 420,
    time: '20 min',
    rating: 4.6,
    reviews: 178,
    tags: ['Lavkarbo', 'Sunn'],
    source: 'KIWI',
    servings: 2,
    difficulty: 'Enkel'
  },
  {
    id: '24',
    title: 'Laks med Asparges og Hollandaise',
    image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=300&fit=crop',
    category: 'KETO',
    calories: 480,
    time: '25 min',
    rating: 4.8,
    reviews: 289,
    tags: ['Keto', 'Omega-3'],
    source: 'Coop Mega',
    servings: 2,
    difficulty: 'Middels'
  },
  
  // VEGAN
  {
    id: '25',
    title: 'Vegetartaco med Søtpotet',
    image: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&h=300&fit=crop',
    category: 'VEGAN',
    calories: 340,
    time: '25 min',
    rating: 4.4,
    reviews: 145,
    tags: ['Plantebasert', 'Fargerik'],
    source: 'REMA 1000',
    servings: 4,
    difficulty: 'Enkel'
  },
  {
    id: '26',
    title: 'Quinoasalat med Kikerter',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop',
    category: 'VEGAN',
    calories: 320,
    time: '15 min',
    rating: 4.5,
    reviews: 98,
    tags: ['Proteinrik', 'Fiber'],
    source: 'Meny',
    servings: 2,
    difficulty: 'Enkel'
  }
];

const categories = ['Alle', 'Frokost', 'Lunsj', 'Middag', 'Snacks', 'Keto', 'Vegan'];

export default function MealsScreen() {
  const [activeCategory, setActiveCategory] = useState('Alle');
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['1', '10']));

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const filteredRecipes = activeCategory === 'Alle' 
    ? recipes 
    : recipes.filter(r => 
        r.category.toLowerCase() === activeCategory.toLowerCase() ||
        r.tags.some(tag => tag.toLowerCase().includes(activeCategory.toLowerCase()))
      );

  return (
    <div className="screen">
      {/* Hero Banner */}
      <div className="relative h-56">
        <img 
          src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=400&fit=crop" 
          alt="Keto mat"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
          <h1 className="text-3xl font-bold mb-1">NORSK MAT</h1>
          <p className="text-sm opacity-90">Oppskrifter fra Rema, Meny, Coop & Kiwi</p>
        </div>
        <div className="absolute top-3 right-3 flex gap-1">
          <div className="w-2 h-2 bg-orange-500 rounded-full" />
          <div className="w-2 h-2 bg-white/50 rounded-full" />
          <div className="w-2 h-2 bg-white/50 rounded-full" />
        </div>
      </div>

      {/* Category Filter */}
      <div className="sticky top-0 bg-white z-10 py-3 border-b shadow-sm">
        <div className="scroll-container">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-medium text-sm transition-all ${
                activeCategory === cat
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Recipe Count */}
      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filteredRecipes.length} oppskrifter funnet
        </p>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <span>Sorter:</span>
          <select className="bg-transparent font-medium text-gray-600">
            <option>Populære</option>
            <option>Nyeste</option>
            <option>Raskeste</option>
          </select>
        </div>
      </div>

      {/* Recipe Cards */}
      <div className="space-y-4 pb-28">
        {filteredRecipes.map((recipe) => (
          <div key={recipe.id} className="recipe-card">
            <div className="relative">
              <img 
                src={recipe.image} 
                alt={recipe.title}
                className="recipe-image"
              />
              <button 
                onClick={() => toggleFavorite(recipe.id)}
                className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-md"
              >
                <Star 
                  className={`w-5 h-5 ${
                    favorites.has(recipe.id) 
                      ? 'fill-yellow-400 text-yellow-400' 
                      : 'text-gray-400'
                  }`} 
                />
              </button>
              <div className="absolute bottom-3 left-3 flex gap-2">
                <span className="recipe-tag">{recipe.category}</span>
                <span className="recipe-tag bg-black/50 text-white backdrop-blur">
                  {recipe.source}
                </span>
              </div>
            </div>
            
            <div className="recipe-content">
              <h3 className="font-semibold text-gray-800 text-base mb-2 line-clamp-2">
                {recipe.title}
              </h3>
              
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-orange-500" />
                  <span>{recipe.calories} kcal</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{recipe.time}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{recipe.servings} pers</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1.5">
                  {recipe.tags.slice(0, 2).map((tag) => (
                    <span 
                      key={tag}
                      className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-orange-500">
                  <Star className="w-4 h-4 fill-current" />
                  <span className="text-sm font-medium">{recipe.rating}</span>
                  <span className="text-xs text-gray-400">({recipe.reviews})</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredRecipes.length === 0 && (
        <div className="text-center py-12">
          <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Ingen oppskrifter funnet</p>
          <p className="text-sm text-gray-400">Prøv en annen kategori</p>
        </div>
      )}
    </div>
  );
}
