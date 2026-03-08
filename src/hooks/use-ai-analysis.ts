'use client';

import { useState, useCallback } from 'react';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { FoodAnalysisSchema, DraftItem, FoodAnalysis } from '@/types/food';
import { useEncryption } from '@/hooks/useEncryption';
import { compressImage, blobToImageData } from '@/lib/image-utils';
import { classifyFoodLocally } from '@/lib/local-ai';

interface UseAiAnalysisOptions {
  onItemsIdentified: (items: DraftItem[]) => void;
  onPreviewGenerated?: (url: string | null) => void;
  onCompressionStats?: (stats: { original: number; compressed: number } | null) => void;
  onUploadProgress?: (progress: 'idle' | 'uploading' | 'streaming' | 'review' | 'complete') => void;
  mealType: string;
}

export function useAiAnalysis({
  onItemsIdentified,
  onPreviewGenerated,
  onCompressionStats,
  onUploadProgress,
  mealType
}: UseAiAnalysisOptions) {
  const { encryptBinary, generateSessionKey, exportKeyToBase64, isReady, vaultKey } = useEncryption();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageIv, setImageIv] = useState<string | null>(null);

  const { submit, isLoading: isStreaming } = useObject({
    api: '/api/analyze',
    schema: FoodAnalysisSchema,
    onFinish: async (event) => {
      if (event.object?.items) {
        const aiItems: DraftItem[] = event.object.items.map((item: FoodAnalysis['items'][number]) => ({
          foodName: item?.name ?? '',
          calories: item?.calories ?? 0,
          protein: item?.protein_g ?? 0,
          carbs: item?.carbs_g ?? 0,
          fat: item?.fat_g ?? 0,
          source: 'AI_ESTIMATE',
          servingGrams: 100,
          numericQuantity: item?.numeric_quantity,
          unit: item?.unit,
          isEnhancing: true,
          notes: item?.notes,
          usdaMatch: item?.usdaMatch,
        }));
        
        onItemsIdentified(aiItems);
        onUploadProgress?.('review');

        // USDA Enrichment
        try {
          const res = await fetch('/api/food/usda/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: aiItems }),
          });
          
          if (res.ok) {
            const enrichedData = await res.json();
            onItemsIdentified(enrichedData.items.map((item: DraftItem) => ({
              ...item,
              source: item.source || 'USDA',
              isEnhancing: false,
            })));
          } else {
            onItemsIdentified(aiItems.map(item => ({ ...item, isEnhancing: false })));
          }
        } catch (err) {
          console.error('USDA enrichment failed:', err);
          onItemsIdentified(aiItems.map(item => ({ ...item, isEnhancing: false })));
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
      submit({ 
        imageUrl: encryptedBase64,
        mealTypeHint: mealType 
      }, {
        headers: {
          'x-session-key': sessionKeyBase64,
          'x-session-iv': ivBase64
        }
      } as { headers?: Record<string, string> }); // useObject types might need cast if headers not in options
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
