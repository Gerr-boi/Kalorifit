import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { searchFoods, type FoodSearchResult } from '../../lib/foodSearch';

type Props = {
  initialQuery?: string;
  onSelect: (result: FoodSearchResult, grams: number) => void;
  onClose: () => void;
};

const SOURCE_BADGE: Record<string, string> = {
  openfoodfacts: 'Open Food Facts',
  matvaretabellen: 'Matvaretabellen',
  composite: 'Sammensatt estimat',
};

const SOURCE_COLOR: Record<string, string> = {
  openfoodfacts: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  matvaretabellen: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  composite: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

type MicroRow = { label: string; value: number; unit: string };

function MicrosSection({
  micros,
  grams,
}: {
  micros: NonNullable<FoodSearchResult['micros']>;
  grams: number;
}) {
  const scale = grams / 100;
  const rows: MicroRow[] = [
    ...(micros.fiber_g != null ? [{ label: 'Fiber', value: micros.fiber_g, unit: 'g' }] : []),
    ...(micros.sugar_g != null ? [{ label: 'Sukker', value: micros.sugar_g, unit: 'g' }] : []),
    ...(micros.saturatedFat_g != null ? [{ label: 'Mettet fett', value: micros.saturatedFat_g, unit: 'g' }] : []),
    ...(micros.salt_g != null ? [{ label: 'Salt', value: micros.salt_g, unit: 'g' }] : []),
    ...(micros.calcium_mg != null ? [{ label: 'Kalsium', value: micros.calcium_mg, unit: 'mg' }] : []),
    ...(micros.iron_mg != null ? [{ label: 'Jern', value: micros.iron_mg, unit: 'mg' }] : []),
    ...(micros.potassium_mg != null ? [{ label: 'Kalium', value: micros.potassium_mg, unit: 'mg' }] : []),
    ...(micros.vitaminC_mg != null ? [{ label: 'Vitamin C', value: micros.vitaminC_mg, unit: 'mg' }] : []),
    ...(micros.vitaminD_ug != null ? [{ label: 'Vitamin D', value: micros.vitaminD_ug, unit: 'µg' }] : []),
  ];

  if (!rows.length) return null;

  return (
    <div className="mt-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 p-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
      {rows.map(({ label, value, unit }) => (
        <div key={label} className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {Math.round(value * scale * 10) / 10}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

const GRAM_PRESETS = [50, 100, 150, 200, 300];

export default function FoodSearchModal({ initialQuery = '', onSelect, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [gramsMap, setGramsMap] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-search if initial query provided
  useEffect(() => {
    inputRef.current?.focus();
    if (initialQuery.trim().length >= 2) triggerSearch(initialQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function triggerSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const found = await searchFoods(q.trim());
      setResults(found);
      setLoading(false);
    }, 400);
  }

  function handleQueryChange(q: string) {
    setQuery(q);
    triggerSearch(q);
  }

  function getGrams(id: string) {
    return gramsMap[id] ?? 100;
  }

  function setGrams(id: string, g: number) {
    setGramsMap((prev) => ({ ...prev, [id]: Math.max(1, g) }));
  }

  function handleSelect(result: FoodSearchResult) {
    onSelect(result, getGrams(result.id));
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-t-2xl flex flex-col"
        style={{ maxHeight: '88vh', animation: 'slide-fade-in 0.22s ease both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
          <Search className="w-4 h-4 text-orange-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="F.eks. bakt potet med ost og søtmais…"
            className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="px-3 pt-2 text-xs text-gray-400 dark:text-gray-500">
          Søker i Open Food Facts og Matvaretabellen · Skriv ingredienser med «og»/«med» for estimat
        </p>

        {/* Results list */}
        <div className="overflow-y-auto flex-1 p-3 space-y-2 pb-6">
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">
              Ingen resultater for «{query}»
            </p>
          )}

          {query.trim().length < 2 && (
            <p className="text-center text-sm text-gray-300 dark:text-gray-600 py-10">
              Begynn å skrive for å søke…
            </p>
          )}

          {results.map((result) => {
            const g = getGrams(result.id);
            const scale = g / 100;
            const scaled = {
              kcal: Math.round(result.per100g.kcal * scale),
              protein: Math.round(result.per100g.protein * scale * 10) / 10,
              carbs: Math.round(result.per100g.carbs * scale * 10) / 10,
              fat: Math.round(result.per100g.fat * scale * 10) / 10,
            };
            const isExpanded = expandedId === result.id;

            return (
              <div
                key={result.id}
                className="rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-sm"
              >
                {/* Name row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 leading-snug">
                      {result.name}
                    </p>
                    {result.brand && (
                      <p className="text-xs text-gray-400 truncate">{result.brand}</p>
                    )}
                    {result.isComposite && result.compositeIngredients && (
                      <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
                        {result.compositeIngredients.join(' · ')}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${SOURCE_COLOR[result.source] ?? ''}`}
                  >
                    {SOURCE_BADGE[result.source] ?? result.source}
                  </span>
                </div>

                {/* Macro pills */}
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {scaled.kcal} kcal
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {scaled.protein}g P
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    {scaled.carbs}g K
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {scaled.fat}g F
                  </span>
                  <span className="text-xs text-gray-400 ml-auto">per {g}g</span>
                </div>

                {/* Micros accordion */}
                {result.micros && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : result.id)}
                    className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Mikronæringsstoffer
                  </button>
                )}
                {isExpanded && result.micros && (
                  <MicrosSection micros={result.micros} grams={g} />
                )}

                {/* Gram input + presets + Velg */}
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={g}
                      onChange={(e) => setGrams(result.id, Number(e.target.value) || 100)}
                      className="w-14 shrink-0 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white px-2 py-1 text-xs text-center outline-none focus:border-orange-400"
                    />
                    <span className="text-xs text-gray-400 shrink-0">g</span>
                    {GRAM_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setGrams(result.id, preset)}
                        className={`shrink-0 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                          g === preset
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-orange-300'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelect(result)}
                    className="shrink-0 rounded-lg bg-orange-500 text-white text-xs font-semibold px-3 py-1.5 active:opacity-80"
                  >
                    Velg
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
