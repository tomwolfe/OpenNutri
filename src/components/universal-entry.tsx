'use client';

import { useState, useCallback } from 'react';
import { WifiOff, Lock } from 'lucide-react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useAiAnalysis } from '@/hooks/use-ai-analysis';
import { usePersistence } from '@/hooks/use-persistence';
import { useEncryption } from '@/hooks/useEncryption';
import { DiscoveryMode, EntryMode, SearchResult } from '@/components/dashboard/discovery-mode';
import { ReviewMode } from '@/components/dashboard/review-mode';
import { DraftItem } from '@/types/food';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FoodLog } from '@/hooks/use-daily-logs';
import { useEffect } from 'react';

interface UniversalEntryProps {
  onComplete?: () => void;
  onError?: (error: string) => void;
  editingLog?: FoodLog;
}

type UploadProgress = 'idle' | 'uploading' | 'streaming' | 'review' | 'complete';

export function UniversalEntry({ onComplete, onError: _onError, editingLog }: UniversalEntryProps) {
  const { isAvailable: isOnline } = useOfflineQueue();
  const { vaultKey, unlockVault, isReady } = useEncryption();
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  // Local UI State
  const [mode, setMode] = useState<EntryMode>(editingLog ? 'text' : 'text');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMealType, setSelectedMealType] = useState(editingLog?.mealType || 'breakfast');
  const [items, setItems] = useState<DraftItem[]>(editingLog?.items as DraftItem[] || []);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>(editingLog ? 'review' : 'idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(editingLog?.imageUrl || null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  // Pre-fill state if editingLog changes
  useEffect(() => {
    if (editingLog) {
      setItems(editingLog.items as DraftItem[]);
      setSelectedMealType(editingLog.mealType);
      setPreviewUrl(editingLog.imageUrl || null);
      setUploadProgress('review');
    }
  }, [editingLog]);

  // Check if vault needs unlocking
  const needsUnlock = isReady && !vaultKey;

  const handleUnlock = async () => {
    if (!unlockPassword) return;
    setIsUnlocking(true);
    setUnlockError(null);

    try {
      const res = await fetch('/api/auth/keys');
      if (!res.ok) {
        throw new Error('Failed to fetch encryption keys');
      }
      const keys = await res.json();

      await unlockVault(
        keys.userId, // use the userId returned from /api/auth/keys
        unlockPassword,
        keys.salt,
        keys.encryptedVaultKey,
        keys.encryptionIv
      );

      setUnlockPassword('');
      setIsUnlocking(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Incorrect password';
      setUnlockError(message);
      setIsUnlocking(false);
    }
  };

  const { saveLog, isSaving } = usePersistence({
    onSuccess: () => {
      setUploadProgress('complete');
      setTimeout(() => onComplete?.(), 1000);
    },
    onError: (error) => {
      console.error('Food logging failed:', error);
      // If vault is locked, show unlock prompt
      if (error.includes('Vault is locked')) {
        setUnlockError('Please unlock your vault to log food');
        return;
      }
      // Show error to user via alert (simple approach)
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

      {/* Vault Unlock Prompt */}
      {needsUnlock && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-lg text-center">Unlock Your Vault</CardTitle>
            <CardDescription className="text-center">
              Enter your password to decrypt your data and log food
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {unlockError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {unlockError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="unlock-password">Password</Label>
              <Input
                id="unlock-password"
                type="password"
                placeholder="Enter your password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                autoFocus
              />
            </div>
            <Button
              onClick={handleUnlock}
              disabled={isUnlocking || !unlockPassword}
              className="w-full"
            >
              {isUnlocking ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Unlock Vault
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Entry Mode - hidden when vault needs unlocking */}
      {!needsUnlock && (
        <>
          <DiscoveryMode
            mode={mode}
            onModeChange={setMode}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            isSearching={false}
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
            onSave={() => saveLog(
              items, 
              selectedMealType, 
              imageUrl || (editingLog?.imageUrl || null), 
              imageIv || (editingLog?.imageIv || null),
              editingLog?.id,
              editingLog ? new Date(editingLog.timestamp) : undefined
            )}
            onAddItem={() => setItems([...items, { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'MANUAL', servingGrams: 100 }])}
            onRemoveItem={(index) => setItems(items.filter((_, i) => i !== index))}
          />
        </>
      )}
    </div>
  );
}
