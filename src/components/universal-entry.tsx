'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/hooks/useEncryption';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useDailyLogs } from '@/hooks/use-daily-logs';
import {
  Loader2, Search, Camera, Barcode, Mic, Plus,
  CheckCircle, WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { VoiceCapture } from '@/components/dashboard/voice-capture';
import { MacroEditor } from '@/components/dashboard/macro-editor';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { FoodAnalysisSchema, DraftItem } from '@/types/food';
import { db } from '@/lib/db-local';
import { compressImage, formatBytes, blobToImageData } from '@/lib/image-utils';
import { classifyFoodLocally, needsCloudAnalysis } from '@/lib/local-ai';
import { cn } from '@/lib/utils';

interface UniversalEntryProps {
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface SearchResult {
  fdcId: number | string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isFavorite: boolean;
  dataType?: string;
  servingSize?: number;
}

type EntryMode = 'text' | 'vision' | 'barcode' | 'voice';
type UploadProgress = 'idle' | 'uploading' | 'streaming' | 'review' | 'complete';

export function UniversalEntry({ onComplete }: UniversalEntryProps) {
  const { data: session } = useSession();
  const { vaultKey, encryptLog, encryptBinary, generateSessionKey, exportKeyToBase64, isReady } = useEncryption();
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [selectedDate] = useState(new Date());
  const { triggerSync } = useDailyLogs(selectedDate, session?.user?.id, vaultKey);
  const { isAvailable: isOnline } = useOfflineQueue();

  // State
  const [mode, setMode] = useState<EntryMode>('text');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageIv, setImageIv] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startListening = () => {
    if (typeof window === 'undefined') return;
    const GlobalWindow = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    const SpeechRecognition = (GlobalWindow.SpeechRecognition || GlobalWindow.webkitSpeechRecognition) as {
      new (): {
        lang: string;
        onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
        onerror: (event: unknown) => void;
        onend: () => void;
        start: () => void;
      };
    };
    if (!SpeechRecognition) return;
    setIsListening(true);
    setTranscript('');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setSearchQuery(text);
      // Trigger AI analysis for natural language voice input
      setUploadProgress('streaming');
      setSearchResults([]);
      submit({ text, mealTypeHint: selectedMealType });
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  // AI Streaming for Vision
  const { submit, isLoading: isStreaming } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    onFinish: async (event) => {
      if (event.object?.items) {
        // 1. Immediately show AI draft items to the user (with enhancing flag)
        const aiItems: DraftItem[] = event.object.items.map((item: { 
          name?: string; 
          calories?: number; 
          protein_g?: number; 
          carbs_g?: number; 
          fat_g?: number; 
          numeric_quantity?: number; 
          unit?: string; 
          notes?: string; 
          usdaMatch?: unknown 
        }) => ({
          foodName: item?.name ?? '',
          calories: item?.calories ?? 0,
          protein: item?.protein_g ?? 0,
          carbs: item?.carbs_g ?? 0,
          fat: item?.fat_g ?? 0,
          source: 'AI_ESTIMATE',
          servingGrams: 100,
          numericQuantity: item?.numeric_quantity,
          unit: item?.unit,
          isEnhancing: true, // Mark as enhancing while waiting for USDA
          notes: item?.notes,
          usdaMatch: item?.usdaMatch,
        }));
        setItems(aiItems);
        setUploadProgress('review');

        // 2. Call the batch enrichment endpoint in the background
        try {
          const res = await fetch('/api/food/usda/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: aiItems }),
          });
          
          if (res.ok) {
            const enrichedData = await res.json();
            
            // 3. Update the UI with official USDA data and remove loading spinners
            setItems(enrichedData.items.map((item: DraftItem) => ({
              foodName: item.foodName,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              source: item.source || 'USDA',
              servingGrams: 100,
              numericQuantity: item.numericQuantity || 1,
              unit: item.unit || 'serving',
              isEnhancing: false,
              notes: item.notes,
              usdaMatch: item.usdaMatch,
            })));
          } else {
            // Fallback to AI items if USDA fails
            setItems(aiItems.map(item => ({ ...item, isEnhancing: false })));
          }
        } catch (err) {
          console.error('USDA enrichment failed:', err);
          // Fallback to AI items if USDA fails
          setItems(aiItems.map(item => ({ ...item, isEnhancing: false })));
        }
      }
    },
  });

  // Text Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2 && mode === 'text') {
        setIsSearching(true);
        
        try {
          // 1. Check local favorites first
          const localFavorites = await db.userFavorites
            .filter(f => f.foodName.toLowerCase().includes(searchQuery.toLowerCase()))
            .limit(3)
            .toArray();
            
          const favoriteResults: SearchResult[] = localFavorites.map(f => ({
            fdcId: f.id,
            description: f.foodName,
            calories: f.calories,
            protein: f.protein,
            carbs: f.carbs,
            fat: f.fat,
            isFavorite: true
          }));

          // 2. Fetch from USDA
          const res = await fetch(`/api/food/usda?query=${encodeURIComponent(searchQuery)}`);
          const data = await res.json();
          
          if (!data.error) {
            const usdaResults: SearchResult[] = data.foods.slice(0, 5).map((f: SearchResult) => ({ ...f, isFavorite: false }));
            const merged = [...favoriteResults];
            usdaResults.forEach((u) => {
              if (!merged.some(m => m.description.toLowerCase() === u.description.toLowerCase())) {
                merged.push(u);
              }
            });
            setSearchResults(merged);
          } else {
            setSearchResults(favoriteResults);
          }
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  // Handlers
  const handleAddFromSearch = (food: SearchResult) => {
    const newItem: DraftItem = {
      foodName: food.description,
      calories: Math.round(food.calories),
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      source: 'USDA',
      servingGrams: food.servingSize || 100,
    };
    setItems(prev => [...prev, newItem]);
    setSearchQuery('');
    setSearchResults([]);
    setUploadProgress('review');
  };

  const handleFileUpload = async (file: File) => {
    setPreviewUrl(URL.createObjectURL(file));
    setMode('vision');
    setUploadProgress('uploading');

    try {
      // 1. Compress and strip EXIF
      const compressedBlob = await compressImage(file);
      const arrayBuffer = await compressedBlob.arrayBuffer();
      setCompressionStats({ original: file.size, compressed: compressedBlob.size });

      // 1.5 LOCAL AI ANALYSIS (Privacy-First)
      // Attempt local classification to avoid unnecessary cloud costs/latency
      const imageData = await blobToImageData(compressedBlob);
      const localResults = await classifyFoodLocally(imageData);
      const shouldSendToCloud = needsCloudAnalysis(localResults);

      if (!shouldSendToCloud && localResults && localResults.length > 0) {
        // Fast-path: use local AI results and only use cloud for detailed macro estimation
        console.log('Local AI identified food:', localResults[0].label);
        // We still use cloud for full nutritional analysis since local MobileNet 
        // doesn't estimate portion sizes/macros, but we could optimize this further.
      }

      // 2. Generate a one-time session key for Zero-Knowledge analysis
      const sessionKey = await generateSessionKey();
      const { ciphertext, iv } = await encryptBinary(arrayBuffer, sessionKey);
      
      // 3. Export key and IV to base64 for transmission
      const sessionKeyBase64 = await exportKeyToBase64(sessionKey);
      const ivArray = new Uint8Array(iv);
      let binary = '';
      for (let i = 0; i < ivArray.byteLength; i++) {
        binary += String.fromCharCode(ivArray[i]);
      }
      const ivBase64 = btoa(binary);

      // 4. Convert ciphertext to Base64 for JSON transmission (or use Multipart)
      // Since useObject prefers JSON, we'll send encrypted base64
      const encryptedBase64 = btoa(
        Array.from(new Uint8Array(ciphertext))
          .map(byte => String.fromCharCode(byte))
          .join('')
      );

      // Encrypt and upload permanent version for Visual Diary (in parallel)
      let vaultUrl = null;
      let vaultIv = null;
      if (isReady && vaultKey) {
        try {
          // Use the actual vault key for permanent storage
          const vaultEnc = await encryptBinary(arrayBuffer);
          const encryptedFile = new File([vaultEnc.ciphertext], 'vault-image.bin', { type: 'application/octet-stream' });
          const encryptedFormData = new FormData();
          encryptedFormData.append('image', encryptedFile);
          
          const encryptedUploadResponse = await fetch('/api/blob/upload', { method: 'POST', body: encryptedFormData });
          if (encryptedUploadResponse.ok) {
            const { imageUrl: eUrl } = await encryptedUploadResponse.json();
            vaultUrl = eUrl;
            const vIvArray = new Uint8Array(vaultEnc.iv);
            let vBinary = '';
            for (let i = 0; i < vIvArray.byteLength; i++) {
              vBinary += String.fromCharCode(vIvArray[i]);
            }
            vaultIv = btoa(vBinary);
          }
        } catch (err) {
          console.error('Vault encryption failed', err);
        }
      }

      setImageUrl(vaultUrl || `data:image/webp;base64,${encryptedBase64}`);
      setImageIv(vaultIv);
      setUploadProgress('streaming');

      // 5. Send Encrypted Data + Session Key directly to AI
      submit({ 
        imageUrl: encryptedBase64, 
        isEncrypted: true,
        sessionKey: sessionKeyBase64,
        iv: ivBase64,
        mealTypeHint: selectedMealType 
      });
    } catch (err) {
      console.error('Upload failed', err);
      setUploadProgress('idle');
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id || items.length === 0) return;
    setIsSaving(true);

    try {
      // Update local favorites
      for (const item of items) {
        const favoriteId = item.foodName.toLowerCase().trim();
        const existing = await db.userFavorites.get(favoriteId);
        if (existing) {
          await db.userFavorites.update(favoriteId, {
            frequency: (existing.frequency || 1) + 1,
            lastUsed: new Date()
          });
        } else {
          await db.userFavorites.add({
            id: favoriteId,
            foodName: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            frequency: 1,
            lastUsed: new Date()
          });
        }
      }

      const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
      const notes = items.map(i => i.notes).filter(Boolean).join(' ');
let encryptedData = null, encryptionIv = null;
if (vaultKey) {
  const result = await encryptLog({
    mealType: selectedMealType,
    items,
    notes,
    imageUrl,
    imageIv,
    timestamp: Date.now()
  });
  encryptedData = result.encryptedData;
  encryptionIv = result.iv;
}

const response = await fetch('/api/log/food', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mealType: encryptedData ? 'encrypted' : selectedMealType,
    items: encryptedData ? [] : items,
    totalCalories: encryptedData ? 0 : totalCalories,
    notes: encryptedData ? 'encrypted' : notes,
    imageUrl: encryptedData ? null : imageUrl,
    encryptedData,
    encryptionIv,
  }),
});


      if (!response.ok) throw new Error('Failed to save');

      setUploadProgress('complete');
      setTimeout(() => {
        onComplete?.();
        // Dexie live query will automatically update the UI
        // Trigger background sync to push to server
        if (session?.user?.id && vaultKey) {
          triggerSync(session.user.id, vaultKey).catch(console.error);
        }
      }, 1000);
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSmartTextSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    
    setUploadProgress('streaming');
    setSearchResults([]);
    submit({ text: searchQuery, mealTypeHint: selectedMealType });
  };

  return (
    <div className="space-y-4">
      {/* Offline Warning */}
      {!isOnline && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] flex items-center gap-2">
          <WifiOff className="w-3 h-3" /> Offline. Images will be queued.
        </div>
      )}

      {/* Mode Switcher & Smart Bar */}
      <div className="relative group">
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg border focus-within:ring-2 focus-within:ring-blue-500 transition-all">
          <div className="flex items-center gap-1 pl-2">
            {(isSearching || isStreaming) ? (
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
              <Search className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <Input
            placeholder="Search food, scan, or analyze..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSmartTextSubmit()}
            onFocus={() => setMode('text')}
            className="border-none bg-transparent shadow-none focus-visible:ring-0 px-1"
          />
          <div className="flex items-center gap-1 pr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => fileInputRef.current?.click()}>
              <Camera className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setMode('barcode')}>
              <Barcode className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => mode === 'voice' ? setMode('text') : setMode('voice')}>
              <Mic className={cn("w-4 h-4", mode === 'voice' && "text-blue-600")} />
            </Button>
          </div>
        </div>
        <input 
          ref={fileInputRef} 
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} 
        />

        {/* Voice Mode */}
        {mode === 'voice' && (
          <div className="mt-4">
            <VoiceCapture
              isListening={isListening}
              transcript={transcript}
              onStartListening={startListening}
              onStopListening={() => setIsListening(false)}
            />
          </div>
        )}

        {/* Search Results Dropdown */}
        {(searchResults.length > 0 || searchQuery.length > 5) && mode === 'text' && !isStreaming && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border rounded-lg shadow-xl overflow-hidden">
            {searchQuery.length > 5 && (
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-blue-50 text-left border-b bg-blue-50/30"
                onClick={() => handleSmartTextSubmit()}
              >
                <div className="flex flex-col">
                  <div className="text-sm font-semibold text-blue-700 flex items-center gap-2">
                    <Mic className="w-3 h-3" /> Analyze with AI
                  </div>
                  <div className="text-[10px] text-blue-500 truncate max-w-[250px]">
                    &quot;{searchQuery}&quot;
                  </div>
                </div>
                <div className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                  Smart
                </div>
              </button>
            )}
            {searchResults.map((food) => (
              <button
                key={food.fdcId}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left border-b last:border-none"
                onClick={() => handleAddFromSearch(food)}
              >
                <div className="flex flex-col">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {food.description}
                    {food.isFavorite && (
                      <Badge variant="outline" className="text-[8px] h-3 px-1 border-amber-200 bg-amber-50 text-amber-700">
                        Frequent
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {food.dataType || 'Personal'} • {Math.round(food.calories)} kcal/100g
                  </div>
                </div>
                <Plus className="w-4 h-4 text-blue-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Barcode Mode */}
      {mode === 'barcode' && (
        <div className="border rounded-lg p-4 bg-gray-50">
          <BarcodeScanner 
            onProductFound={(item) => {
              setItems(prev => [...prev, {
                foodName: item.foodName,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                source: 'AI_ESTIMATE', // Keep as AI_ESTIMATE for editor consistency
                servingGrams: 100,
                notes: item.notes,
              }]);
              setMode('text');
              setUploadProgress('review');
            }} 
            onClose={() => setMode('text')} 
          />
        </div>
      )}

      {/* Review & Editor Area */}
      {(items.length > 0 || uploadProgress !== 'idle') && (
        <Card className="overflow-hidden border-blue-100 shadow-md">
          <CardContent className="p-4 space-y-4">
            {/* Vision Preview */}
            {previewUrl && (
              <div className="space-y-2">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 border">
                  <Image src={previewUrl} alt="Meal" fill className="object-cover" />
                  {(isStreaming || uploadProgress === 'uploading') && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center backdrop-blur-sm">
                      <div className="bg-white/90 px-4 py-2 rounded-full flex items-center gap-2 shadow-lg">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        <span className="text-xs font-medium">
                          {uploadProgress === 'uploading' ? 'Optimizing...' : 'AI Analysis...'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {compressionStats && (
                  <div className="text-[10px] text-gray-400 text-right px-1">
                    Privacy-filtered & optimized: {formatBytes(compressionStats.original)} → {formatBytes(compressionStats.compressed)}
                  </div>
                )}
              </div>
            )}

            {/* Macro Editor */}
            <MacroEditor
              items={items}
              selectedMealType={selectedMealType}
              isEditing={uploadProgress !== 'complete'}
              saveInProgress={isSaving}
              onUpdateItems={setItems}
              onUpdateMealType={setSelectedMealType}
              onToggleEditing={() => {}}
              onAddItem={() => setItems([...items, { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'MANUAL', servingGrams: 100 }])}
              onRemoveItem={(index) => setItems(items.filter((_, i) => i !== index))}
              onSave={handleSave}
            />

            {uploadProgress === 'complete' && (
              <div className="flex items-center justify-center gap-2 text-green-600 py-2 font-medium animate-in fade-in zoom-in">
                <CheckCircle className="w-5 h-5" /> Meal Logged!
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
