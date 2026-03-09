'use client';

import { useState, useCallback } from 'react';
import { WifiOff } from 'lucide-react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useAiAnalysis } from '@/hooks/use-ai-analysis';
import { usePersistence } from '@/hooks/use-persistence';
import { DiscoveryMode, EntryMode, SearchResult } from '@/components/dashboard/discovery-mode';
import { ReviewMode } from '@/components/dashboard/review-mode';
import { DraftItem } from '@/types/food';

interface UniversalEntryProps {
  onComplete?: () => void;
  onError?: (error: string) => void;
}

type UploadProgress = 'idle' | 'uploading' | 'streaming' | 'review' | 'complete';

export function UniversalEntry({ onComplete, onError }: UniversalEntryProps) {
  const { isAvailable: isOnline } = useOfflineQueue();
  
  // Local UI State
  const [mode, setMode] = useState<EntryMode>('text');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('breakfast');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const { saveLog, isSaving } = usePersistence({
    onSuccess: () => {
      setUploadProgress('complete');
      setTimeout(() => onComplete?.(), 1000);
    },
    onError: (error) => {
      console.error('Food logging failed:', error);
      // Show error to user via alert (simple approach)
      // In production, you might want to use a toast notification system
      alert(`Failed to log meal: ${error}. Please try again.`);
      setUploadProgress('review'); // Allow retry
    }
  });

  const {
    handleFileUpload,
    analyzeText,
    isStreaming,
    imageUrl,
    imageIv
  } = useAiAnalysis({
    mealType: selectedMealType,
    onItemsIdentified: setItems,
    onPreviewGenerated: setPreviewUrl,
    onCompressionStats: setCompressionStats,
    onUploadProgress: setUploadProgress
  });

  const handleStartVoice = useCallback(() => {
    if (typeof window === 'undefined') return;
    const GlobalWindow = window as unknown as {
      SpeechRecognition: unknown;
      webkitSpeechRecognition: unknown;
    };
    const SpeechRecognitionConstructor = (GlobalWindow.SpeechRecognition || GlobalWindow.webkitSpeechRecognition) as {
      new (): {
        lang: string;
        onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
        onend: () => void;
        start: () => void;
      };
    } | undefined;

    if (!SpeechRecognitionConstructor) return;

    setIsListening(true);
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      setSearchQuery(text);
      setMode('text');
      analyzeText(text);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }, [analyzeText]);

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
    setUploadProgress('review');
  };

  const handleBarcodeFound = (item: DraftItem) => {
    setItems(prev => [...prev, {
      foodName: item.foodName,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source: 'AI_ESTIMATE',
      servingGrams: 100,
      notes: item.notes,
    }]);
    setMode('text');
    setUploadProgress('review');
  };

  return (
    <div className="space-y-4">
      {!isOnline && (
        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[10px] flex items-center gap-2">
          <WifiOff className="w-3 h-3" /> Offline. Images will be queued.
        </div>
      )}

      <DiscoveryMode
        mode={mode}
        onModeChange={setMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        isSearching={false} // Managed inside DiscoveryMode now
        isStreaming={isStreaming}
        onSmartTextSubmit={() => analyzeText(searchQuery)}
        onFileUpload={handleFileUpload}
        onBarcodeFound={handleBarcodeFound}
        onAddFromSearch={handleAddFromSearch}
        onStartVoice={handleStartVoice}
        isListening={isListening}
        transcript={transcript}
      />

      <ReviewMode
        items={items}
        previewUrl={previewUrl}
        compressionStats={compressionStats}
        uploadProgress={uploadProgress}
        isStreaming={isStreaming}
        isSaving={isSaving}
        selectedMealType={selectedMealType}
        onUpdateItems={setItems}
        onUpdateMealType={setSelectedMealType}
        onSave={() => saveLog(items, selectedMealType, imageUrl, imageIv)}
        onAddItem={() => setItems([...items, { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'MANUAL', servingGrams: 100 }])}
        onRemoveItem={(index) => setItems(items.filter((_, i) => i !== index))}
      />
    </div>
  );
}
