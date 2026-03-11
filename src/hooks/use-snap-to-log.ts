/**
 * useSnapToLog Hook
 *
 * Business logic hook for Snap-to-Log feature.
 * Handles AI streaming, encryption, local caching, and offline queueing.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useEncryption } from '@/hooks/useEncryption';
import { db } from '@/lib/db-local';
import { classifyFoodLocally, needsCloudAnalysis, ImageClassificationResult, onProgress, onDeviceInfo, onModelState } from '@/lib/local-ai';
import { FoodAnalysisSchema, DraftItem } from '@/types/food';
import { compressImage } from '@/lib/image-utils';
import { addToLocalCache } from '@/lib/ai-local-semantic';

export interface UseSnapToLogOptions {
  onComplete?: (foodLog: {
    id: string;
    totalCalories: number;
    items: Array<{
      foodName: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }>;
  }) => void;
  onError?: (error: string) => void;
  onDraftSaved?: () => void;
  onSyncComplete?: (syncedCount: number) => void;
}

export interface UseSnapToLogReturn {
  // State
  mode: 'vision' | 'barcode' | 'voice';
  isListening: boolean;
  setIsListening: React.Dispatch<React.SetStateAction<boolean>>;
  transcript: string;
  selectedFile: File | null;
  previewUrl: string | null;
  uploadProgress: 'idle' | 'uploading' | 'streaming' | 'review' | 'complete';
  setUploadProgress: React.Dispatch<React.SetStateAction<'idle' | 'uploading' | 'streaming' | 'review' | 'complete'>>;
  uploadError: string | null;
  selectedMealType: string;
  draftItems: DraftItem[];
  isEditingItems: boolean;
  saveInProgress: boolean;
  imageUrl: string | null;
  imageIv: string | null;
  compressionStats: { original: number; compressed: number } | null;
  localAiResults: ImageClassificationResult[] | null;
  modelLoadingProgress: { message: string; progress: number; stage?: string; details?: any } | null;
  deviceInfo: { type: string; name?: string; isMobile?: boolean } | null;
  modelState: { classifierState: string; embedderState: string } | null;
  isOnline: boolean;
  isSyncing: boolean;
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lastAutoSavedId: string | null;
  object: any;

  // Actions
  setMode: React.Dispatch<React.SetStateAction<'vision' | 'barcode' | 'voice'>>;
  setSelectedFile: React.Dispatch<React.SetStateAction<File | null>>;
  setPreviewUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setDraftItems: React.Dispatch<React.SetStateAction<DraftItem[]>>;
  setSelectedMealType: React.Dispatch<React.SetStateAction<string>>;
  setIsEditingItems: React.Dispatch<React.SetStateAction<boolean>>;
  handleFileSelect: (file: File) => void;
  handleUpload: () => Promise<void>;
  handleSaveDraft: () => Promise<void>;
  handleAutoSave: (items: DraftItem[], totalCalories: number) => Promise<void>;
  handleClear: () => Promise<void>;
  handleVoiceSubmit: (text: string) => Promise<void>;
  startListening: () => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  enrichItemsWithUsda: (items: DraftItem[]) => Promise<void>;
}

export function useSnapToLog({
  onComplete,
  onError,
  onDraftSaved,
  onSyncComplete,
}: UseSnapToLogOptions = {}): UseSnapToLogReturn {
  const [mode, setMode] = useState<'vision' | 'barcode' | 'voice'>('vision');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'streaming' | 'review' | 'complete'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>('unclassified');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [isEditingItems, setIsEditingItems] = useState(false);
  const [saveInProgress, setSaveInProgress] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageIv, setImageIv] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);
  const [localAiResults, setLocalAiResults] = useState<ImageClassificationResult[] | null>(null);
  const [modelLoadingProgress, setModelLoadingProgress] = useState<{ message: string; progress: number; stage?: string; details?: any } | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ type: string; name?: string; isMobile?: boolean } | null>(null);
  const [modelState, setModelState] = useState<{ classifierState: string; embedderState: string } | null>(null);

  const { encryptLog, encryptBinary, generateSessionKey, exportKeyToBase64, isReady, vaultKey } = useEncryption();
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const { queueImage, syncQueue, isAvailable: isIndexedDBAvailable } = useOfflineQueue();
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastAutoSavedId, setLastAutoSavedId] = useState<string | null>(null);

  const { submit, object } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    onFinish: async (event) => {
      if (event.object?.items) {
        const aiItems = event.object.items.map((item: any) => ({
          foodName: item.name,
          calories: item.calories || 0,
          protein: item.protein_g || 0,
          carbs: item.carbs_g || 0,
          fat: item.fat_g || 0,
          source: item.source || 'AI_ESTIMATE',
          servingGrams: 100,
          numericQuantity: item.numeric_quantity,
          unit: item.unit,
          isEnhancing: true,
          notes: item.notes,
          usdaMatch: item.usdaMatch,
          confidence: item.confidence,
        }));

        const avgConfidence = event.object.items.reduce((sum: number, item: any) => sum + (item.confidence || 0), 0) / event.object.items.length;

        if (autoSaveEnabled && avgConfidence >= 0.9) {
          await handleAutoSave(aiItems, aiItems.reduce((sum: number, item: DraftItem) => sum + item.calories, 0));
        } else {
          setDraftItems(aiItems);
          setUploadProgress('review');
        }

        try {
          const res = await fetch('/api/food/usda/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: aiItems }),
          });

          if (res.ok) {
            const enrichedData = await res.json();
            setDraftItems(enrichedData.items.map((item: DraftItem) => ({
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
            setDraftItems(aiItems.map((item: DraftItem) => ({ ...item, isEnhancing: false })));
          }
        } catch (err) {
          console.error('USDA enrichment failed:', err);
          setDraftItems(aiItems.map((item: DraftItem) => ({ ...item, isEnhancing: false })));
        }
      }
    },
    onError: (err) => {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    onProgress((update) => {
      setModelLoadingProgress(update);
    });

    onDeviceInfo((info) => {
      setDeviceInfo(info);
    });

    onModelState((state) => {
      setModelState({
        classifierState: state.classifierState,
        embedderState: state.embedderState,
      });
    });

    import('@/lib/local-ai').then(({ getDeviceInfo, getModelState }) => {
      getDeviceInfo().then(setDeviceInfo);
      getModelState().then((state) => {
        if (state) {
          setModelState({
            classifierState: state.classifierState,
            embedderState: state.embedderState,
          });
        }
      });
    });
  }, []);

  const handleVoiceSubmit = useCallback(async (text: string) => {
    setUploadProgress('streaming');
    setUploadError(null);
    try {
      submit({ text, mealTypeHint: selectedMealType });
    } catch {
      setUploadError('Failed to analyze voice input.');
      setUploadProgress('idle');
    }
  }, [selectedMealType, submit]);

  const startListening = useCallback(() => {
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

    if (!SpeechRecognition) {
      setUploadError('Speech recognition not supported in this browser.');
      return;
    }
    setIsListening(true);
    setTranscript('');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const text = event.results[0][0].transcript;
      setTranscript(text);
      handleVoiceSubmit(text);
    };
    recognition.onerror = () => {
      setIsListening(false);
      setUploadError('Failed to recognize speech.');
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  }, [handleVoiceSubmit]);

  const handleSyncAndUpload = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncQueue();
      if (result.success > 0) onSyncComplete?.(result.success);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, syncQueue, onSyncComplete]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (selectedFile) handleSyncAndUpload();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [selectedFile, handleSyncAndUpload]);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      onError?.('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError?.('File too large. Max size is 10MB');
      return;
    }
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }, [onError]);

  const enrichItemsWithUsda = useCallback(async (items: DraftItem[]) => {
    try {
      const res = await fetch('/api/food/usda/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (res.ok) {
        const enrichedData = await res.json();
        setDraftItems(enrichedData.items.map((item: DraftItem) => ({
          ...item,
          isEnhancing: false,
        })));
      } else {
        setDraftItems(items.map(item => ({ ...item, isEnhancing: false })));
      }
    } catch (err) {
      console.error('USDA enrichment failed:', err);
      setDraftItems(items.map(item => ({ ...item, isEnhancing: false })));
    }
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !previewUrl) return;
    setUploadProgress('uploading');
    setUploadError(null);

    try {
      const localResults = await classifyFoodLocally(previewUrl);
      setLocalAiResults(localResults);

      const compressedBlob = await compressImage(selectedFile);
      const arrayBuffer = await compressedBlob.arrayBuffer();
      setCompressionStats({ original: selectedFile.size, compressed: compressedBlob.size });

      const shouldSkipCloud = localResults && !needsCloudAnalysis(localResults);

      if (shouldSkipCloud) {
        const topResult = localResults![0];
        const favoriteId = topResult.label.toLowerCase().trim();
        const favorite = await db.foodFavorites.get(favoriteId);

        const localItem: DraftItem = {
          foodName: favorite?.description || topResult.label,
          calories: favorite?.calories || topResult.macros?.calories || 0,
          protein: favorite?.protein || topResult.macros?.protein || 0,
          carbs: favorite?.carbs || topResult.macros?.carbs || 0,
          fat: favorite?.fat || topResult.macros?.fat || 0,
          source: favorite ? 'USER_HISTORY' : 'LOCAL_AI',
          servingGrams: 100,
          isEnhancing: isOnline,
        };

        setDraftItems([localItem]);
        setUploadProgress('review');

        if (isOnline) {
          enrichItemsWithUsda([localItem]);
        }
        return;
      }

      if (!isOnline) {
        const compressedFile = new File([compressedBlob], 'food-analysis.webp', { type: 'image/webp' });
        const queueId = await queueImage(compressedFile, selectedMealType);
        if (queueId) {
          setUploadError('You are offline. Image queued.');
          setUploadProgress('idle');
          return;
        }
        throw new Error('Failed to queue image');
      }

      const sessionKey = await generateSessionKey();
      const { ciphertext, iv } = await encryptBinary(arrayBuffer, sessionKey);

      const sessionKeyBase64 = await exportKeyToBase64(sessionKey);
      const ivArray = new Uint8Array(iv);
      let binary = '';
      for (let i = 0; i < ivArray.byteLength; i++) {
        binary += String.fromCharCode(ivArray[i]);
      }
      const ivBase64 = btoa(binary);

      setUploadProgress('streaming');

      const encryptedImageBlob = new Blob([ciphertext], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('image', encryptedImageBlob, 'encrypted-image.bin');
      formData.append('mealTypeHint', selectedMealType);
      formData.append('isEncrypted', 'true');

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'x-session-key': sessionKeyBase64,
            'x-session-iv': ivBase64,
            'x-ephemeral': 'true'
          },
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Analysis failed');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let accumulatedText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += new TextDecoder().decode(value);

          try {
            const lines = accumulatedText.split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1];
            if (lastLine.startsWith('data: ')) {
              const jsonStr = lastLine.slice(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed.items && Array.isArray(parsed.items)) {
                const streamingItems = parsed.items.map((item: any) => ({
                  foodName: item.name,
                  calories: item.calories || 0,
                  protein: item.protein_g || 0,
                  carbs: item.carbs_g || 0,
                  fat: item.fat_g || 0,
                  source: item.source || 'AI_STREAM',
                  servingGrams: 100,
                  isEnhancing: true,
                  notes: item.notes,
                }));
                setDraftItems(streamingItems);
              }
            }
          } catch {
            // Ignore parse errors during streaming
          }
        }

        const finalLines = accumulatedText.split('\n').filter(line => line.trim());
        for (const line of finalLines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed.items && Array.isArray(parsed.items)) {
                const aiItems = parsed.items.map((item: any) => ({
                  foodName: item.name,
                  calories: item.calories || 0,
                  protein: item.protein_g || 0,
                  carbs: item.carbs_g || 0,
                  fat: item.fat_g || 0,
                  source: item.source || 'AI_ESTIMATE',
                  servingGrams: 100,
                  numericQuantity: item.numeric_quantity,
                  unit: item.unit,
                  isEnhancing: true,
                  notes: item.notes,
                  usdaMatch: item.usdaMatch,
                }));
                setDraftItems(aiItems);
                setUploadProgress('review');

                try {
                  const res = await fetch('/api/food/usda/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: aiItems }),
                  });

                  if (res.ok) {
                    const enrichedData = await res.json();
                    setDraftItems(enrichedData.items.map((item: DraftItem) => ({
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
                    setDraftItems(aiItems.map((item: DraftItem) => ({ ...item, isEnhancing: false })));
                  }
                } catch (err) {
                  console.error('USDA enrichment failed:', err);
                  setDraftItems(aiItems.map((item: DraftItem) => ({ ...item, isEnhancing: false })));
                }
                break;
              }
            } catch {
              // Continue parsing
            }
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
        setUploadError(errorMessage);
        setUploadProgress('idle');
        onError?.(errorMessage);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    }
  }, [selectedFile, previewUrl, selectedMealType, isOnline, queueImage, onError, isReady, vaultKey, encryptBinary, generateSessionKey, exportKeyToBase64, enrichItemsWithUsda]);

  const handleSaveDraft = useCallback(async () => {
    if (draftItems.length === 0) return;
    setSaveInProgress(true);
    try {
      let finalImageUrl = imageUrl;
      let finalImageIv = imageIv;

      if (!finalImageUrl && selectedFile && isReady && vaultKey) {
        try {
          const compressedBlob = await compressImage(selectedFile);
          const arrayBuffer = await compressedBlob.arrayBuffer();
          const vaultEnc = await encryptBinary(arrayBuffer);
          const encryptedFile = new File([vaultEnc.ciphertext], 'vault-image.bin', { type: 'application/octet-stream' });
          const encryptedFormData = new FormData();
          encryptedFormData.append('image', encryptedFile);
          const encryptedUploadResponse = await fetch('/api/blob/upload', { method: 'POST', body: encryptedFormData });
          if (encryptedUploadResponse.ok) {
            const { imageUrl: eUrl } = await encryptedUploadResponse.json();
            finalImageUrl = eUrl;
            const vIvArray = new Uint8Array(vaultEnc.iv);
            let vBinary = '';
            for (let i = 0; i < vIvArray.byteLength; i++) {
              vBinary += String.fromCharCode(vIvArray[i]);
            }
            finalImageIv = btoa(vBinary);

            setImageUrl(finalImageUrl);
            setImageIv(finalImageIv);
          }
        } catch (err) {
          console.error('Vault encryption/upload failed during save', err);
        }
      }

      for (const item of draftItems) {
        if (!item.foodName) continue;
        const favoriteId = item.foodName.toLowerCase().trim();
        const existing = await db.foodFavorites.get(favoriteId);
        if (existing) {
          await db.foodFavorites.update(favoriteId, {
            frequency: (existing.frequency || 1) + 1,
            lastUsed: new Date()
          });
        } else {
          await db.foodFavorites.add({
            id: favoriteId,
            fdcId: item.foodName,
            description: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            frequency: 1,
            lastUsed: new Date()
          });
        }
      }

      const totalCalories = draftItems.reduce((sum, item) => sum + item.calories, 0);
      const notes = draftItems.map(i => i.notes).filter(Boolean).join(' ') || null;

      let encryptedData = null, encryptionIv = null;
      if (isReady) {
        try {
          const result = await encryptLog({
            mealType: selectedMealType,
            items: draftItems,
            notes,
            imageUrl: finalImageUrl,
            imageIv: finalImageIv,
            timestamp: Date.now()
          });
          encryptedData = result.encryptedData;
          encryptionIv = result.iv;
        } catch (err) {
          console.error('Encryption failed', err);
        }
      }

      const response = await fetch('/api/log/food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType: encryptedData ? 'encrypted' : selectedMealType,
          items: encryptedData ? [] : draftItems,
          totalCalories: encryptedData ? 0 : totalCalories,
          notes: encryptedData ? 'encrypted' : notes,
          imageUrl: encryptedData ? null : finalImageUrl,
          aiConfidenceScore: 0.8,
          encryptedData,
          encryptionIv,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');
      setUploadProgress('complete');
      onDraftSaved?.();
      onComplete?.({ id: data.logId, totalCalories, items: draftItems });
    } catch (err) {
      onError?.((err as Error).message);
    } finally {
      setSaveInProgress(false);
    }
  }, [draftItems, selectedMealType, onComplete, onError, onDraftSaved, imageUrl, isReady, encryptLog, imageIv, selectedFile, vaultKey, encryptBinary]);

  const handleAutoSave = useCallback(async (items: DraftItem[], totalCalories: number) => {
    if (items.length === 0 || !autoSaveEnabled) return;

    try {
      let finalImageUrl = imageUrl;
      let finalImageIv = imageIv;

      if (!finalImageUrl && selectedFile && isReady && vaultKey) {
        try {
          const compressedBlob = await compressImage(selectedFile);
          const arrayBuffer = await compressedBlob.arrayBuffer();
          const vaultEnc = await encryptBinary(arrayBuffer);
          const encryptedFile = new File([vaultEnc.ciphertext], 'vault-image.bin', { type: 'application/octet-stream' });
          const encryptedFormData = new FormData();
          encryptedFormData.append('image', encryptedFile);
          const encryptedUploadResponse = await fetch('/api/blob/upload', { method: 'POST', body: encryptedFormData });
          if (encryptedUploadResponse.ok) {
            const { imageUrl: eUrl } = await encryptedUploadResponse.json();
            finalImageUrl = eUrl;
            const vIvArray = new Uint8Array(vaultEnc.iv);
            let vBinary = '';
            for (let i = 0; i < vIvArray.byteLength; i++) {
              vBinary += String.fromCharCode(vIvArray[i]);
            }
            finalImageIv = btoa(vBinary);

            setImageUrl(finalImageUrl);
            setImageIv(finalImageIv);
          }
        } catch (err) {
          console.error('Vault encryption/upload failed during auto-save', err);
        }
      }

      for (const item of items) {
        if (!item.foodName) continue;
        const favoriteId = item.foodName.toLowerCase().trim();
        const existing = await db.foodFavorites.get(favoriteId);
        if (existing) {
          await db.foodFavorites.update(favoriteId, {
            frequency: (existing.frequency || 1) + 1,
            lastUsed: new Date()
          });
        } else {
          await db.foodFavorites.add({
            id: favoriteId,
            fdcId: item.foodName,
            description: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            frequency: 1,
            lastUsed: new Date()
          });
        }

        if (item.numericQuantity && item.unit) {
          await addToLocalCache({
            id: item.usdaMatch?.fdcId || item.foodName,
            description: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            sodium: item.micronutrients?.sodium,
            numericQuantity: item.numericQuantity,
            unit: item.unit,
            servingGrams: item.servingGrams,
          }, true);
        }
      }

      const notes = items.map(i => i.notes).filter(Boolean).join(' ') || null;
      let encryptedData = null, encryptionIv = null;
      if (isReady) {
        const result = await encryptLog({
          mealType: selectedMealType,
          items,
          notes,
          imageUrl: finalImageUrl,
          imageIv: finalImageIv,
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
          imageUrl: encryptedData ? null : finalImageUrl,
          aiConfidenceScore: 0.95,
          encryptedData,
          encryptionIv,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to auto-save');

      setLastAutoSavedId(data.logId);
      setUploadProgress('complete');
      onDraftSaved?.();
      onComplete?.({ id: data.logId, totalCalories, items });
    } catch (err) {
      console.error('Auto-save failed, falling back to review mode:', err);
      setUploadProgress('review');
      onError?.((err as Error).message);
    }
  }, [autoSaveEnabled, selectedMealType, onComplete, onError, onDraftSaved, imageUrl, isReady, encryptLog, imageIv, selectedFile, vaultKey, encryptBinary]);

  const handleClear = useCallback(async () => {
    if (imageUrl && !imageUrl.startsWith('data:')) {
      fetch(`/api/blob/delete?url=${encodeURIComponent(imageUrl)}`, { method: 'DELETE' }).catch(() => {});
    }
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setDraftItems([]);
    setSelectedMealType('unclassified');
    setIsEditingItems(false);
    setUploadProgress('idle');
    setUploadError(null);
    setImageUrl(null);
    setCompressionStats(null);
  }, [previewUrl, imageUrl]);

  return {
    mode,
    isListening,
    setIsListening,
    transcript,
    selectedFile,
    previewUrl,
    uploadProgress,
    setUploadProgress,
    uploadError,
    selectedMealType,
    draftItems,
    isEditingItems,
    saveInProgress,
    imageUrl,
    imageIv,
    compressionStats,
    localAiResults,
    modelLoadingProgress,
    deviceInfo,
    modelState,
    isOnline,
    isSyncing,
    autoSaveEnabled,
    setAutoSaveEnabled,
    lastAutoSavedId,
    object,
    setMode,
    setSelectedFile,
    setPreviewUrl,
    setDraftItems,
    setSelectedMealType,
    setIsEditingItems,
    handleFileSelect,
    handleUpload,
    handleSaveDraft,
    handleAutoSave,
    handleClear,
    handleVoiceSubmit,
    startListening,
    onFileInputChange,
    enrichItemsWithUsda,
  };
}
