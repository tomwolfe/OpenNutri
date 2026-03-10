'use client';

import { useState, useCallback, useRef } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { FoodAnalysisSchema, DraftItem, FoodAnalysis } from '@/types/food';
import { useEncryption } from '@/hooks/useEncryption';
import { compressImage, blobToImageData } from '@/lib/image-utils';
import { classifyFoodLocally } from '@/lib/local-ai';
import { searchLocalHistory, addToLocalCache } from '@/lib/ai-local-semantic';

interface UseAiAnalysisOptions {
  onItemsIdentified: (items: DraftItem[]) => void;
  onPreviewGenerated?: (url: string | null) => void;
  onCompressionStats?: (stats: { original: number; compressed: number } | null) => void;
  onUploadProgress?: (progress: 'idle' | 'uploading' | 'streaming' | 'review' | 'complete') => void;
  onAutoSave?: (items: DraftItem[], totalCalories: number) => void;
  mealType: string;
  autoSaveHighConfidence?: boolean;
  confidenceThreshold?: number;
}

export function useAiAnalysis({
  onItemsIdentified,
  onPreviewGenerated,
  onCompressionStats,
  onUploadProgress,
  onAutoSave,
  mealType,
  autoSaveHighConfidence = false,
  confidenceThreshold = 0.9
}: UseAiAnalysisOptions) {
  const { encryptBinary, generateSessionKey, exportKeyToBase64, isReady, vaultKey } = useEncryption();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageIv, setImageIv] = useState<string | null>(null);
  
  // Ref to hold dynamic headers for the next request
  const headersRef = useRef<Record<string, string> | null>(null);

  const { submit, isLoading: isStreaming } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    headers: () => headersRef.current ?? {},
    onFinish: async (event) => {
      if (event.object?.items) {
        const aiItems: DraftItem[] = event.object.items.map((item: FoodAnalysis['items'][number]) => ({
          foodName: item?.name ?? '',
          calories: item?.calories ?? 0,
          protein: item?.protein_g ?? 0,
          carbs: item?.carbs_g ?? 0,
          fat: item?.fat_g ?? 0,
          micronutrients: {
            fiber: item?.fiber_g,
            sugar: item?.sugar_g,
            sodium: item?.sodium_mg,
            potassium: item?.potassium_mg,
            calcium: item?.calcium_mg,
            iron: item?.iron_mg,
            vitaminC: item?.vitamin_c_mg,
          },
          source: 'AI_ESTIMATE',
          servingGrams: 100,
          numericQuantity: item?.numeric_quantity,
          unit: item?.unit,
          isEnhancing: true,
          notes: item?.notes,
          usdaMatch: item?.usdaMatch,
        }));

        // Calculate average confidence for auto-save decision
        const avgConfidence = event.object.items.reduce((sum, item) => sum + (item.confidence || 0), 0) / event.object.items.length;
        const totalCalories = aiItems.reduce((sum, item) => sum + item.calories, 0);

        // Task 1.1: Automatic Affirmation - Auto-save if confidence is high enough
        if (autoSaveHighConfidence && avgConfidence >= confidenceThreshold && onAutoSave) {
          // Trigger auto-save immediately
          onAutoSave(aiItems, totalCalories);
          onUploadProgress?.('complete');
        } else {
          onItemsIdentified(aiItems);
          onUploadProgress?.('review');
        }

        // USDA Enrichment with Local Cache Fallback
        try {
          const enrichedItems = [...aiItems];
          const itemsToFetch: number[] = [];

          // 1. Try local semantic match first with portion memory
          for (let i = 0; i < enrichedItems.length; i++) {
            const item = enrichedItems[i];
            const localMatch = await searchLocalHistory(item.foodName);

            if (localMatch) {
              enrichedItems[i] = {
                ...item,
                calories: localMatch.calories,
                protein: localMatch.protein,
                carbs: localMatch.carbs,
                fat: localMatch.fat,
                micronutrients: localMatch.micronutrients,
                source: 'LOCAL_CACHE',
                isEnhancing: false,
                // Task 1.3: Apply user's typical portion
                numericQuantity: localMatch.typicalQuantity || item.numericQuantity,
                unit: localMatch.typicalUnit || item.unit,
                servingGrams: localMatch.typicalServingGrams || item.servingGrams,
              };
            } else {
              itemsToFetch.push(i);
            }
          }

          // 2. Only fetch remaining items from server
          if (itemsToFetch.length > 0) {
            const fetchItems = itemsToFetch.map(idx => enrichedItems[idx]);
            const res = await fetch('/api/food/usda/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items: fetchItems }),
            });

            if (res.ok) {
              const enrichedData = await res.json();
              const serverItems = enrichedData.items as DraftItem[];

              serverItems.forEach((item, idx) => {
                const originalIdx = itemsToFetch[idx];
                enrichedItems[originalIdx] = {
                  ...item,
                  source: item.source || 'USDA',
                  isEnhancing: false,
                };

                // 3. Add to local cache for future use with portion memory
                if (item.foodName && item.calories) {
                  addToLocalCache({
                    id: item.usdaMatch?.fdcId || item.foodName,
                    description: item.foodName,
                    calories: item.calories,
                    protein: item.protein || 0,
                    carbs: item.carbs || 0,
                    fat: item.fat || 0,
                    micronutrients: item.micronutrients,
                    sodium: item.micronutrients?.sodium,
                    numericQuantity: item.numericQuantity,
                    unit: item.unit,
                    servingGrams: item.servingGrams,
                  });
                }
              });
            }
          }

          // Only show items for review if not auto-saved
          if (!autoSaveHighConfidence || avgConfidence < confidenceThreshold) {
            onItemsIdentified(enrichedItems);
          }
        } catch (err) {
          console.error('USDA enrichment failed:', err);
          if (!autoSaveHighConfidence || avgConfidence < confidenceThreshold) {
            onItemsIdentified(aiItems.map(item => ({ ...item, isEnhancing: false })));
          }
        }
      }
    },
  });

  const handleFileUpload = useCallback(async (file: File) => {
    const preview = URL.createObjectURL(file);
    onPreviewGenerated?.(preview);
    onUploadProgress?.('uploading');

    try {
      const compressedBlob = await compressImage(file);
      const arrayBuffer = await compressedBlob.arrayBuffer();
      onCompressionStats?.({ original: file.size, compressed: compressedBlob.size });

      // Local AI check
      const imageData = await blobToImageData(compressedBlob);
      await classifyFoodLocally(imageData);
      // We still send to cloud for full analysis as per current implementation
      
      // Zero-Knowledge header-based session key distribution
      const sessionKey = await generateSessionKey();
      const { ciphertext, iv } = await encryptBinary(arrayBuffer, sessionKey);
      
      const sessionKeyBase64 = await exportKeyToBase64(sessionKey);
      const ivArray = new Uint8Array(iv);
      let ivBinary = '';
      for (let i = 0; i < ivArray.byteLength; i++) {
        ivBinary += String.fromCharCode(ivArray[i]);
      }
      const ivBase64 = btoa(ivBinary);

      const encryptedBase64 = btoa(
        Array.from(new Uint8Array(ciphertext))
          .map(byte => String.fromCharCode(byte))
          .join('')
      );

      // Permanent vault storage (in parallel)
      let vaultUrl = null;
      let vaultIv = null;
      if (isReady && vaultKey) {
        try {
          const vaultEnc = await encryptBinary(arrayBuffer);
          const encryptedFile = new File([vaultEnc.ciphertext], 'vault-image.bin', { type: 'application/octet-stream' });
          const formData = new FormData();
          formData.append('image', encryptedFile);
          
          const uploadRes = await fetch('/api/blob/upload', { method: 'POST', body: formData });
          if (uploadRes.ok) {
            const data = await uploadRes.json();
            vaultUrl = data.imageUrl;
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
      onUploadProgress?.('streaming');

      // Use headers for key distribution to prevent body logging
      headersRef.current = {
        'x-session-key': sessionKeyBase64,
        'x-session-iv': ivBase64,
        'x-ephemeral': 'true' // SIGNAL: Ephemeral in-memory only analysis
      };
      try {
        const { logPrivacyEvent } = await import('@/lib/privacy-audit');
        await logPrivacyEvent('Cloud AI Analysis', 'ai_analysis', `Started analysis for meal type: ${mealType}`, 'success');
        
        submit({
          imageUrl: encryptedBase64,
          mealTypeHint: mealType
        });
      } catch (err) {
        const { logPrivacyEvent } = await import('@/lib/privacy-audit');
        await logPrivacyEvent('Cloud AI Analysis', 'ai_analysis', 'Failed to initiate analysis', 'failure');
        throw err;
      }
    } catch (err) {
      console.error('AI Analysis upload failed', err);
      onUploadProgress?.('idle');
    }
  }, [mealType, encryptBinary, generateSessionKey, exportKeyToBase64, isReady, vaultKey, onPreviewGenerated, onUploadProgress, onCompressionStats, submit]);

  const analyzeText = useCallback((text: string) => {
    onUploadProgress?.('streaming');
    submit({ text, mealTypeHint: mealType });
  }, [mealType, onUploadProgress, submit]);

  return {
    handleFileUpload,
    analyzeText,
    isStreaming,
    imageUrl,
    imageIv,
    setImageUrl,
    setImageIv
  };
}
