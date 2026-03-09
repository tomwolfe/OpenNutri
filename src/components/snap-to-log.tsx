/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI streaming.
 * Uses Vercel AI SDK's useObject hook for native streaming support.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { X, CheckCircle, AlertCircle, Loader2, Edit2, WifiOff, Zap } from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useEncryption } from '@/hooks/useEncryption';
import { db } from '@/lib/db-local';
import { BarcodeScanner } from './barcode-scanner';
import { CameraOverlay } from './dashboard/camera-overlay';
import { MacroEditor } from './dashboard/macro-editor';
import { VoiceCapture } from './dashboard/voice-capture';
import { classifyFoodLocally, needsCloudAnalysis, ImageClassificationResult } from '@/lib/local-ai';
import { FoodAnalysisSchema, DraftItem } from '@/types/food';
import { compressImage, formatBytes } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { addToLocalCache } from '@/lib/ai-local-semantic';

interface SnapToLogProps {
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

export function SnapToLog({ onComplete, onError, onDraftSaved, onSyncComplete }: SnapToLogProps) {
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
  const [imageUrl, setImageUrl] = useState<string | null>(null); // Permanent URL (encrypted if possible)
  const [imageIv, setImageIv] = useState<string | null>(null);
  const [compressionStats, setCompressionStats] = useState<{ original: number; compressed: number } | null>(null);
  const [localAiResults, setLocalAiResults] = useState<ImageClassificationResult[] | null>(null);
  
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
        // 1. Immediately show AI draft items to the user (with enhancing flag)
        const aiItems = event.object.items.map((item: {
          name: string;
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          source?: string;
          notes?: string;
          usdaMatch?: { fdcId: number; description: string };
          numeric_quantity?: number;
          unit?: string;
          confidence?: number;
        }) => ({
          foodName: item.name,
          calories: item.calories || 0,
          protein: item.protein_g || 0,
          carbs: item.carbs_g || 0,
          fat: item.fat_g || 0,
          source: item.source || 'AI_ESTIMATE',
          servingGrams: 100,
          numericQuantity: item.numeric_quantity,
          unit: item.unit,
          isEnhancing: true, // Mark as enhancing while waiting for USDA
          notes: item.notes,
          usdaMatch: item.usdaMatch,
          confidence: item.confidence,
        }));

        // Task 1.1: Automatic Affirmation - Check if we should auto-save
        const avgConfidence = event.object.items.reduce((sum, item) => sum + (item.confidence || 0), 0) / event.object.items.length;
        
        if (autoSaveEnabled && avgConfidence >= 0.9) {
          // Auto-save high confidence results
          await handleAutoSave(aiItems, aiItems.reduce((sum, item) => sum + item.calories, 0));
        } else {
          setDraftItems(aiItems);
          setUploadProgress('review');
        }

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
            // Fallback to AI items if USDA fails
            setDraftItems(aiItems.map(item => ({ ...item, isEnhancing: false })));
          }
        } catch (err) {
          console.error('USDA enrichment failed:', err);
          // Fallback to AI items if USDA fails
          setDraftItems(aiItems.map(item => ({ ...item, isEnhancing: false })));
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

  const handleProductFound = (item: DraftItem) => {
    setDraftItems([item]);
    setUploadProgress('review');
    setMode('vision');
  };

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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // 1. Try Local AI First (Privacy-First)
      const localResults = await classifyFoodLocally(previewUrl);
      setLocalAiResults(localResults);

      const compressedBlob = await compressImage(selectedFile);
      const arrayBuffer = await compressedBlob.arrayBuffer();
      setCompressionStats({ original: selectedFile.size, compressed: compressedBlob.size });

      // Check if local AI is confident enough to skip cloud AI
      const shouldSkipCloud = localResults && !needsCloudAnalysis(localResults);

      if (shouldSkipCloud) {
        const topResult = localResults![0];

        // Tier 2: Cached Knowledge (Check user favorites)
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

      // 2. Fallback to Cloud AI if local is not confident
      const sessionKey = await generateSessionKey();
      const { ciphertext, iv } = await encryptBinary(arrayBuffer, sessionKey);

      // Export key and IV to base64 for headers
      const sessionKeyBase64 = await exportKeyToBase64(sessionKey);
      const ivArray = new Uint8Array(iv);
      let binary = '';
      for (let i = 0; i < ivArray.byteLength; i++) {
        binary += String.fromCharCode(ivArray[i]);
      }
      const ivBase64 = btoa(binary);

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

      setImageUrl(vaultUrl || null);
      setImageIv(vaultIv);
      setUploadProgress('streaming');

      // 3. Send Encrypted Binary Image + Session Key using FormData (not JSON)
      // This prevents base64 images from appearing in request logs
      // Note: We use fetch directly instead of submit() to support binary FormData
      const encryptedImageBlob = new Blob([ciphertext], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('image', encryptedImageBlob, 'encrypted-image.bin');
      formData.append('mealTypeHint', selectedMealType);
      formData.append('isEncrypted', 'true');

      // Start the AI analysis stream via fetch (useObject doesn't support FormData with custom headers)
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'x-session-key': sessionKeyBase64,
            'x-session-iv': ivBase64
          },
          body: formData
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Analysis failed');
        }

        // Read the streaming response
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        let accumulatedText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulatedText += new TextDecoder().decode(value);
          
          // Try to parse partial JSON for streaming updates
          try {
            const lines = accumulatedText.split('\n').filter(line => line.trim());
            const lastLine = lines[lines.length - 1];
            if (lastLine.startsWith('data: ')) {
              const jsonStr = lastLine.slice(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed.items && Array.isArray(parsed.items)) {
                // Update draft items as they stream in
                const streamingItems = parsed.items.map((item: {
                  name: string;
                  calories?: number;
                  protein_g?: number;
                  carbs_g?: number;
                  fat_g?: number;
                  source?: string;
                  notes?: string;
                }) => ({
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

        // Final parse of complete response
        const finalLines = accumulatedText.split('\n').filter(line => line.trim());
        for (const line of finalLines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed.items && Array.isArray(parsed.items)) {
                const aiItems = parsed.items.map((item: {
                  name: string;
                  calories?: number;
                  protein_g?: number;
                  carbs_g?: number;
                  fat_g?: number;
                  source?: string;
                  notes?: string;
                  usdaMatch?: { fdcId: number; description: string };
                  numeric_quantity?: number;
                  unit?: string;
                }) => ({
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

                // Enrich with USDA data
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
      // 1. Update local favorites for all items
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
          // Encrypt FULL log data for privacy including imageUrl
          const result = await encryptLog({
            mealType: selectedMealType,
            items: draftItems,
            notes,
            imageUrl, // This is the vaultUrl
            imageIv,  // This is the vaultIv
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
          // If encrypted, send minimal/generic plaintext data
          mealType: encryptedData ? 'encrypted' : selectedMealType,
          items: encryptedData ? [] : draftItems,
          totalCalories: encryptedData ? 0 : totalCalories,
          notes: encryptedData ? 'encrypted' : notes,
          imageUrl: encryptedData ? null : imageUrl, // Server sees null if encrypted
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
  }, [draftItems, selectedMealType, onComplete, onError, onDraftSaved, imageUrl, isReady, encryptLog, imageIv]);

  const handleAutoSave = useCallback(async (items: DraftItem[], totalCalories: number) => {
    if (items.length === 0 || !autoSaveEnabled) return;
    
    try {
      // Quick save without user review - update favorites and portion memory
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
        
        // Task 1.3: Store portion memory
        if (item.numericQuantity && item.unit) {
          await addToLocalCache({
            id: item.usdaMatch?.fdcId || item.foodName,
            description: item.foodName,
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            sodium: item.sodium,
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
          aiConfidenceScore: 0.95, // High confidence auto-save
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
      // If auto-save fails, fall back to review mode
      setUploadProgress('review');
      onError?.((err as Error).message);
    }
  }, [autoSaveEnabled, selectedMealType, onComplete, onError, onDraftSaved, imageUrl, isReady, encryptLog, imageIv]);

  const handleClear = useCallback(async () => {
    // Only delete if it's a permanent vault URL (not a Base64 data URI)
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [previewUrl, imageUrl]);

  const displayItems = object?.items
    ? (object.items as Array<{
        name: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
        numeric_quantity?: number;
        unit?: string;
      }>).map((item) => ({
        foodName: item?.name ?? '',
        calories: item?.calories ?? 0,
        protein: item?.protein_g ?? 0,
        carbs: item?.carbs_g ?? 0,
        fat: item?.fat_g ?? 0,
        source: 'AI_ESTIMATE',
        servingGrams: 100,
        numericQuantity: item?.numeric_quantity,
        unit: item?.unit,
      }))
    : draftItems;

  const renderStatus = () => {
    const statusMap = {
      uploading: { color: 'text-blue-600', text: 'Uploading image...', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      streaming: { color: 'text-blue-600', text: 'AI is analyzing...', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      review: { color: 'text-amber-600', text: 'Review your meal', icon: <Edit2 className="w-4 h-4" /> },
      complete: { color: 'text-green-600', text: lastAutoSavedId ? 'Auto-saved!' : 'Meal logged!', icon: <CheckCircle className="w-4 h-4" /> },
    };
    const status = statusMap[uploadProgress as keyof typeof statusMap];
    if (!status) return null;
    return (
      <div className={`flex items-center gap-2 ${status.color}`}>
        {status.icon}
        <span>{status.text}</span>
        {lastAutoSavedId && uploadProgress === 'complete' && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
            High confidence
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white rounded-lg shadow-sm border">
      {!isOnline && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Offline. Images will be queued.</span>
        </div>
      )}
      
      {isSyncing && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-800">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Syncing queued images...</span>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Snap to Log</h3>
            <p className="text-sm text-gray-500">Fast nutrition analysis via AI, Barcode, or Voice</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <div className="flex items-center gap-1 text-xs text-gray-600">
              <Zap className="w-3 h-3" />
              <span>Auto-save</span>
            </div>
          </label>
        </div>
      </div>

      {uploadProgress === 'idle' && mode === 'barcode' ? (
        <BarcodeScanner onProductFound={handleProductFound} onClose={() => setMode('vision')} />
      ) : uploadProgress === 'idle' && mode === 'voice' ? (
        <VoiceCapture 
          isListening={isListening} 
          transcript={transcript} 
          onStartListening={startListening} 
          onStopListening={() => setIsListening(false)} 
        />
      ) : (
        <div className="space-y-4">
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onFileInputChange} className="hidden" />

          {!previewUrl ? (
            <CameraOverlay 
              mode={mode} 
              onModeChange={setMode}
              onCameraCapture={() => fileInputRef.current?.click()}
              onUploadClick={() => fileInputRef.current?.click()}
            />
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <Image src={previewUrl} alt="Food preview" fill className="object-contain" sizes="400px" />
                <button type="button" onClick={handleClear} disabled={uploadProgress === 'uploading' || uploadProgress === 'streaming'} className="absolute top-2 right-2 p-2 bg-white/90 rounded-full hover:bg-white disabled:opacity-50">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {compressionStats && uploadProgress !== 'idle' && (
                <div className="text-[10px] text-gray-400 text-right">
                  Optimized: {formatBytes(compressionStats.original)} → {formatBytes(compressionStats.compressed)} 
                  ({Math.round((1 - compressionStats.compressed / compressionStats.original) * 100)}% saved)
                </div>
              )}

              {uploadProgress === 'idle' && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!isOnline && !isIndexedDBAvailable}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isOnline ? 'Analyze Food' : 'Queue for Later'}
                </button>
              )}

              {(uploadProgress === 'uploading' || uploadProgress === 'streaming') && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  {renderStatus()}
                  {uploadProgress === 'uploading' && localAiResults && !needsCloudAnalysis(localAiResults) && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full w-fit">
                      <CheckCircle className="w-3 h-3" />
                      Privacy-First: Analyzed on device
                    </div>
                  )}
                </div>
              )}

              {uploadError && (
                <div className="p-3 border bg-red-50 border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900">Analysis failed</p>
                    <p className="text-xs text-red-700">{uploadError}</p>
                    <button type="button" onClick={handleClear} className="mt-2 text-xs underline hover:text-red-900">Clear</button>
                  </div>
                </div>
              )}

              {(uploadProgress === 'streaming' || uploadProgress === 'review' || uploadProgress === 'complete') && displayItems.length > 0 && (
                <div className={cn(
                  "transition-all duration-500 ease-in-out",
                  uploadProgress === 'streaming' ? "opacity-60 grayscale-[0.5]" : "opacity-100"
                )}>
                  {uploadProgress === 'review' && draftItems.some(i => i.source === 'LOCAL_AI' || i.source === 'USER_HISTORY') && (
                    <div className="mb-2 flex items-center gap-1.5 text-[10px] text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full w-fit">
                      <CheckCircle className="w-3 h-3" />
                      Privacy-First: Analyzed on device
                    </div>
                  )}
                  <MacroEditor
                    items={displayItems as DraftItem[]}
                    selectedMealType={selectedMealType}
                    isEditing={isEditingItems && uploadProgress !== 'streaming'}
                    saveInProgress={saveInProgress}
                    onUpdateItems={setDraftItems}
                    onUpdateMealType={setSelectedMealType}
                    onToggleEditing={() => setIsEditingItems(!isEditingItems)}
                    onAddItem={() => setDraftItems([...draftItems, { foodName: '', calories: 0, protein: 0, carbs: 0, fat: 0, source: 'MANUAL', servingGrams: 100 }])}
                    onRemoveItem={(index) => setDraftItems(draftItems.filter((_, i) => i !== index))}
                    onSave={handleSaveDraft}
                  />
                  {uploadProgress === 'streaming' && (
                    <div className="mt-2 text-[10px] text-blue-500 text-center animate-pulse">
                      AI is typing out discoveries...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t text-[10px] text-gray-400 text-center space-y-1">
        <p>Powered by Zhipu GLM-4V & Neon pgvector</p>
        <p className="text-gray-300">
          <strong>Privacy Notice:</strong> Images are temporarily processed by AI and immediately destroyed. 
          They are never stored unencrypted on the server.
        </p>
      </div>
    </div>
  );
}
