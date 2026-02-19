import { useEffect, useMemo, useState } from 'react';

type FoodItem = { name: string; confidence: number };

const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function FoodDetectionPanel() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [hasAttempted, setHasAttempted] = useState(false);

  const previewUrl = useMemo(() => (selectedFile ? URL.createObjectURL(selectedFile) : null), [selectedFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onSelectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    setHasAttempted(false);
    setItems([]);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setError('Invalid file type. Use jpg/png/webp.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setSelectedFile(null);
      setError('Image too large. Max 8MB.');
      return;
    }

    setSelectedFile(file);
  };

  const detectFood = async () => {
    if (!selectedFile) {
      setError('Choose an image first.');
      return;
    }

    setDetecting(true);
    setError(null);
    setHasAttempted(false);

    try {
      const form = new FormData();
      form.append('image', selectedFile);

      const response = await fetch('/api/detect-food', {
        method: 'POST',
        body: form,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Food detection failed.');
      }

      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);
      setHasAttempted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Food detection failed.');
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-black/50 rounded-xl p-4 text-white">
      <h3 className="text-base font-semibold mb-2">Food Detection (MVP)</h3>
      <p className="text-xs text-white/70 mb-3">Upload an image and detect food labels with confidence.</p>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onSelectFile}
        className="w-full text-xs mb-3"
      />

      {previewUrl && (
        <img
          src={previewUrl}
          alt="Selected preview"
          className="w-full h-40 object-cover rounded-lg border border-white/20 mb-3"
        />
      )}

      <button
        onClick={detectFood}
        disabled={detecting || !selectedFile}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium"
      >
        {detecting ? 'Detecting...' : 'Detect food'}
      </button>

      {error && <p className="text-red-300 text-sm mt-3">{error}</p>}

      {!error && hasAttempted && items.length === 0 && (
        <p className="text-sm text-white/80 mt-3">No food detected in this image.</p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.name} className="flex justify-between bg-white/10 rounded-md px-3 py-2 text-sm">
              <span className="capitalize">{item.name}</span>
              <span>{Math.round(item.confidence * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
