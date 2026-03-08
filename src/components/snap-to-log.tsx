/**
 * Snap-to-Log Component
 *
 * Food image capture and upload UI with real-time AI streaming.
 * Uses Vercel AI SDK's useObject hook for native streaming support.
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { X, CheckCircle, AlertCircle, Loader2, Edit2, WifiOff } from 'lucide-react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useEncryption } from '@/hooks/useEncryption';
import { BarcodeScanner } from './barcode-scanner';
import { CameraOverlay } from './dashboard/camera-overlay';
import { MacroEditor } from './dashboard/macro-editor';
import { VoiceCapture } from './dashboard/voice-capture';
import { FoodAnalysisSchema, DraftItem } from '@/types/food';
import { compressImage, formatBytes, blobToBase64DataUri } from '@/lib/image-utils';
import { cn } from '@/lib/utils';

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
  
  const { encryptLog, encryptBinary, isReady } = useEncryption();
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSyncing, setIsSyncing] = useState(false);
  const { queueImage, syncQueue, isAvailable: isIndexedDBAvailable } = useOfflineQueue();

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
        }));

        setDraftItems(aiItems);
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
            setDraftItems(enrichedData.items.map((item: any) => ({
              foodName: item.foodName,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat,
              source: item.source || 'USDA',
              servingGrams: 100,
              numericQuantity: item.numeric_quantity || 1,
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setUploadError('Speech recognition not supported in this browser.');
      return;
    }
    setIsListening(true);
    setTranscript('');
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
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

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploadProgress('uploading');
    setUploadError(null);

    try {
      const compressedBlob = await compressImage(selectedFile);
      const compressedFile = new File([compressedBlob], 'food-analysis.webp', { type: 'image/webp' });
      setCompressionStats({ original: selectedFile.size, compressed: compressedBlob.size });

      if (!isOnline) {
        const queueId = await queueImage(compressedFile, selectedMealType);
        if (queueId) {
          setUploadError('You are offline. Image queued.');
          setUploadProgress('idle');
          return;
        }
        throw new Error('Failed to queue image');
      }

      // Convert to Base64 data URI for direct AI analysis (Zero-Knowledge: image never touches storage)
      const base64DataUri = await blobToBase64DataUri(compressedBlob);
      setImageUrl(base64DataUri); // Store Base64 temporarily for the session

      // Encrypt and upload permanent version for Visual Diary (in parallel, non-blocking)
      let vaultUrl = null;
      let vaultIv = null;
      if (isReady && encryptBinary) {
        try {
          const arrayBuffer = await compressedBlob.arrayBuffer();
          const { ciphertext, iv } = await encryptBinary(arrayBuffer);

          const encryptedFile = new File([ciphertext], 'vault-image.bin', { type: 'application/octet-stream' });
          const encryptedFormData = new FormData();
          encryptedFormData.append('image', encryptedFile);
          const encryptedUploadResponse = await fetch('/api/blob/upload', { method: 'POST', body: encryptedFormData });
          if (encryptedUploadResponse.ok) {
            const { imageUrl: eUrl } = await encryptedUploadResponse.json();
            vaultUrl = eUrl;
            // Convert IV to base64 for JSON storage
            const ivArray = new Uint8Array(iv);
            const binary = Array.from(ivArray)
              .map(byte => String.fromCharCode(byte))
              .join('');
            vaultIv = btoa(binary);
          }
        } catch (err) {
          console.error('Encryption failed', err);
        }
      }

      setImageUrl(vaultUrl || base64DataUri);
      setImageIv(vaultIv);
      setUploadProgress('streaming');
      // Send Base64 directly to AI - no temporary storage needed
      submit({ imageUrl: base64DataUri, mealTypeHint: selectedMealType });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(errorMessage);
      setUploadProgress('idle');
      onError?.(errorMessage);
    }
  }, [selectedFile, selectedMealType, isOnline, queueImage, onError, submit, isReady, encryptBinary]);

  const handleSaveDraft = useCallback(async () => {
    if (draftItems.length === 0) return;
    setSaveInProgress(true);
    try {
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
  }, [draftItems, selectedMealType, onComplete, onError, onDraftSaved, imageUrl, isReady, encryptLog]);

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
    ? (object.items as any[]).map((item) => ({
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
      complete: { color: 'text-green-600', text: 'Meal logged!', icon: <CheckCircle className="w-4 h-4" /> },
    };
    const status = statusMap[uploadProgress as keyof typeof statusMap];
    if (!status) return null;
    return (
      <div className={`flex items-center gap-2 ${status.color}`}>
        {status.icon}
        <span>{status.text}</span>
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
        <h3 className="text-lg font-semibold text-gray-900">Snap to Log</h3>
        <p className="text-sm text-gray-500">Fast nutrition analysis via AI, Barcode, or Voice</p>
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
                <div className="p-3 bg-gray-50 rounded-lg">{renderStatus()}</div>
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
