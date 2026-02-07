import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  class: string;
}

interface MapSearchBarProps {
  onSelectLocation: (lat: number, lng: number, label: string) => void;
}

export default function MapSearchBar({ onSelectLocation }: MapSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchNominatim = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1&countrycodes=mx,gt,sv,hn,ni,cr,pa,co,ve,ec,pe,bo,cl,ar,uy,py,cu,do,pr`,
        {
          headers: {
            'Accept-Language': 'es',
          },
        }
      );
      const data: NominatimResult[] = await response.json();
      setResults(data);
      setShowResults(data.length > 0);
    } catch (error) {
      console.error('Error searching Nominatim:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchNominatim(value), 400);
  };

  const handleSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    // Shorten the display name to show just the first 2-3 parts
    const parts = result.display_name.split(',');
    const shortLabel = parts.slice(0, 3).join(',').trim();
    onSelectLocation(lat, lng, shortLabel);
    setQuery(shortLabel);
    setShowResults(false);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="bg-background/90 shadow-lg backdrop-blur-sm h-10 w-10"
        title="Buscar dirección"
      >
        <Search className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="w-72 sm:w-80">
      <div className="relative">
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Buscar dirección o lugar..."
              className="pl-9 pr-8 h-10 bg-background/95 backdrop-blur-sm shadow-lg text-sm"
              autoFocus
            />
            {query && (
              <button
                onClick={handleClear}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setIsOpen(false);
              handleClear();
            }}
            className="h-10 w-10 bg-background/90 shadow-lg backdrop-blur-sm shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Loading indicator */}
        {isSearching && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg p-3 flex items-center gap-2 text-sm text-muted-foreground z-50">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando...
          </div>
        )}

        {/* Results dropdown */}
        {showResults && !isSearching && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg overflow-hidden z-50 max-h-60 overflow-y-auto">
            {results.map((result) => {
              const parts = result.display_name.split(',');
              const mainName = parts[0].trim();
              const secondary = parts.slice(1, 3).join(',').trim();
              
              return (
                <button
                  key={result.place_id}
                  onClick={() => handleSelect(result)}
                  className="w-full text-left px-3 py-2.5 hover:bg-accent/50 flex items-start gap-2 border-b last:border-b-0 transition-colors"
                >
                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{mainName}</p>
                    <p className="text-xs text-muted-foreground truncate">{secondary}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {showResults && results.length === 0 && !isSearching && query.length >= 3 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg p-3 text-sm text-muted-foreground z-50">
            No se encontraron resultados
          </div>
        )}
      </div>
    </div>
  );
}
