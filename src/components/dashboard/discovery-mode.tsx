'use client';

import { useRef, useState, useEffect } from 'react';
import { Search, Camera, Barcode, Mic, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { VoiceCapture } from '@/components/dashboard/voice-capture';
import { cn } from '@/lib/utils';
import { db } from '@/lib/db-local';
import { DraftItem } from '@/types/food';

export type EntryMode = 'text' | 'vision' | 'barcode' | 'voice';

export interface SearchResult {
  fdcId: number | string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isFavorite: boolean;
  dataType?: string;
  servingSize?: number;
  _frequency?: number; // Internal field for sorting (Task 1.2)
}

interface DiscoveryModeProps {
  mode: EntryMode;
  onModeChange: (mode: EntryMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isSearching: boolean;
  isStreaming: boolean;
  onSmartTextSubmit: () => void;
  onFileUpload: (file: File) => void;
  onBarcodeFound: (item: DraftItem) => void;
  onAddFromSearch: (food: SearchResult) => void;
  onStartVoice: () => void;
  isListening?: boolean;
  transcript?: string;
}

export function DiscoveryMode({
  mode,
  onModeChange,
  searchQuery,
  onSearchQueryChange,
  isSearching: _isSearching,
  isStreaming,
  onSmartTextSubmit,
  onFileUpload,
  onBarcodeFound,
  onAddFromSearch,
  onStartVoice,
  isListening,
  transcript
}: DiscoveryModeProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (searchQuery.length < 2) {
      // Show favorites when search is empty - sorted by frequency
      const fetchFavorites = async () => {
        const localFavorites = await db.foodFavorites.toArray();
        const favoriteResults: SearchResult[] = localFavorites
          .sort((a, b) => (b.frequency || 0) - (a.frequency || 0)) // Sort by frequency
          .slice(0, 10) // Show top 10 favorites
          .map(f => ({
            fdcId: f.fdcId,
            description: f.description,
            calories: f.calories,
            protein: f.protein,
            carbs: f.carbs,
            fat: f.fat,
            isFavorite: true
          }));
        setSearchResults(favoriteResults);
      };
      fetchFavorites();
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/food/usda?query=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          
          // Get local favorites for boosting
          const localFavorites = await db.foodFavorites.toArray();
          const favoriteMap = new Map(localFavorites.map(f => [f.fdcId.toString(), f.frequency || 0]));

          const usdaResults: SearchResult[] = data.foods.slice(0, 10).map((f: SearchResult) => {
            const fdcIdStr = f.fdcId.toString();
            return {
              ...f,
              isFavorite: favoriteMap.has(fdcIdStr),
              _frequency: favoriteMap.get(fdcIdStr) || 0 // Internal field for sorting
            };
          });

          // Task 1.2: Sort by frequency boost - favorites appear first
          usdaResults.sort((a, b) => {
            // Favorites always come first
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;
            // Among favorites, sort by frequency
            if (a.isFavorite && b.isFavorite) {
              return (b._frequency || 0) - (a._frequency || 0);
            }
            // Non-favorites keep USDA order
            return 0;
          });

          // Remove internal frequency field
          const cleanedResults = usdaResults.map(({ _frequency, ...rest }) => rest);
          setSearchResults(cleanedResults);
        }
      } catch (err) {
        console.error('Search error', err);
        setSearchResults([]);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const toggleFavorite = async (e: React.MouseEvent, food: SearchResult) => {
    e.stopPropagation();
    if (food.isFavorite) {
      await db.foodFavorites.where('fdcId').equals(food.fdcId).delete();
    } else {
      await db.foodFavorites.add({
        id: food.fdcId.toString(),
        fdcId: food.fdcId,
        description: food.description,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        frequency: 1,
        lastUsed: new Date(),
        updatedAt: Date.now()
      });
    }
    // Update local state
    setSearchResults(prev => prev.map(p => 
      p.fdcId === food.fdcId ? { ...p, isFavorite: !p.isFavorite } : p
    ));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 p-1 bg-muted rounded-lg w-full">
        <Button
          variant={mode === 'text' ? 'secondary' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onModeChange('text')}
        >
          <Search className="h-3.5 w-3.5 mr-1.5" />
          Search
        </Button>
        <Button
          variant={mode === 'vision' ? 'secondary' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onModeChange('vision')}
        >
          <Camera className="h-3.5 w-3.5 mr-1.5" />
          Vision
        </Button>
        <Button
          variant={mode === 'barcode' ? 'secondary' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onModeChange('barcode')}
        >
          <Barcode className="h-3.5 w-3.5 mr-1.5" />
          Barcode
        </Button>
        <Button
          variant={mode === 'voice' ? 'secondary' : 'ghost'}
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onModeChange('voice')}
        >
          <Mic className="h-3.5 w-3.5 mr-1.5" />
          Voice
        </Button>
      </div>

      <div className="relative">
        {mode === 'text' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search food or describe a meal..."
                className="pl-10 pr-24 h-12 text-base"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim()) {
                    onSmartTextSubmit();
                  }
                }}
              />
              {searchQuery.length > 0 && (
                <Button 
                  className="absolute right-1.5 top-1.5 h-9"
                  onClick={onSmartTextSubmit}
                  disabled={isStreaming}
                >
                  {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log'}
                </Button>
              )}
            </div>

            {(searchResults.length > 0 || searchQuery.length > 5) && mode === 'text' && !isStreaming && (
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2 border-b bg-muted/30">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                    {searchQuery.length < 2 ? 'Frequently Logged' : 'Search Results'}
                  </span>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {searchResults.map((food) => (
                    <button
                      key={food.fdcId}
                      className="w-full flex items-center justify-between p-3 hover:bg-accent text-left transition-colors"
                      onClick={() => onAddFromSearch(food)}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-medium text-sm truncate">{food.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] h-4 py-0 font-normal">
                            {food.calories} kcal
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            P: {food.protein}g · C: {food.carbs}g · F: {food.fat}g
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-8 w-8", food.isFavorite && "text-orange-500")}
                        onClick={(e) => toggleFavorite(e, food)}
                      >
                        <Plus className={cn("h-4 w-4 transition-transform", food.isFavorite && "rotate-45")} />
                      </Button>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'vision' && (
          <div 
            className="border-2 border-dashed border-muted-foreground/20 rounded-xl p-10 flex flex-col items-center justify-center bg-muted/5 hover:bg-muted/10 transition-colors cursor-pointer group"
            onClick={() => document.getElementById('camera-upload')?.click()}
          >
            <Camera className="h-12 w-12 text-muted-foreground/40 group-hover:text-primary/60 transition-colors mb-4" />
            <p className="text-sm font-medium text-muted-foreground">Take a photo of your food</p>
            <p className="text-xs text-muted-foreground/60 mt-1">AI will estimate nutrients automatically</p>
            <input 
              id="camera-upload"
              type="file" 
              accept="image/*" 
              capture="environment"
              className="hidden" 
              onChange={(e) => e.target.files?.[0] && onFileUpload(e.target.files[0])}
            />
          </div>
        )}

        {mode === 'barcode' && (
          <BarcodeScanner 
            onProductFound={onBarcodeFound}
            onClose={() => onModeChange('text')}
          />
        )}

        {mode === 'voice' && (
          <VoiceCapture 
            isListening={isListening || false}
            transcript={transcript || ''}
            onStartListening={onStartVoice}
            onStopListening={() => {}} // No stop function available in UniversalEntry
          />
        )}
      </div>
    </div>
  );
}
