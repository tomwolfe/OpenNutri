'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/hooks/useEncryption';
import { useDailyLogs } from '@/hooks/use-daily-logs';
import { db } from '@/lib/db-local';
import { DraftItem } from '@/types/food';
import { addToLocalCache } from '@/lib/ai-local-semantic';

interface UsePersistenceOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function usePersistence({ onSuccess, onError }: UsePersistenceOptions = {}) {
  const { data: session } = useSession();
  const { vaultKey, encryptLog } = useEncryption();
  const { triggerSync } = useDailyLogs(new Date(), session?.user?.id);
  const [isSaving, setIsSaving] = useState(false);

  const saveLog = useCallback(async (
    items: DraftItem[],
    mealType: string,
    imageUrl: string | null,
    imageIv: string | null,
    existingId?: string,
    existingTimestamp?: Date
  ) => {
    console.log('[usePersistence] saveLog called:', { itemsCount: items.length, mealType, hasImageUrl: !!imageUrl, hasVaultKey: !!vaultKey, isUpdate: !!existingId });
    if (!session?.user?.id || items.length === 0) {
      console.warn('[usePersistence] Aborting save: no user or empty items', { hasUser: !!session?.user?.id, itemsCount: items.length });
      return;
    }
    setIsSaving(true);
    const userId = session.user.id;

    try {
      const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
      const notes = items.map(i => i.notes).filter(Boolean).join(' ');
      const logId = existingId || crypto.randomUUID();
      const timestamp = existingTimestamp || new Date();

      // 1. Prepare Encrypted Data
      let encryptedData = '', encryptionIv = '';
      if (vaultKey) {
        console.log('[usePersistence] Encrypting food log...');
        const result = await encryptLog({
          mealType,
          items,
          notes,
          imageUrl,
          imageIv,
          timestamp: timestamp.getTime()
        });
        encryptedData = result.encryptedData;
        encryptionIv = result.iv;
      } else {
        console.error('[usePersistence] Vault key missing!');
        throw new Error('Vault is locked. Cannot save encrypted data.');
      }

      // 2. Local-First Write (Save to IndexedDB immediately)
      const foodLog = {
        id: logId,
        userId,
        timestamp,
        mealType,
        totalCalories,
        aiConfidenceScore: 1.0, // Manual entry is 100% confident
        isVerified: true,
        imageUrl,
        notes,
        encryptedData,
        encryptionIv,
        encryptionSalt: null,
        version: 1,
        deviceId: localStorage.getItem('opennutri_device_id'),
        synced: false,
        updatedAt: Date.now(),
      };

      await db.foodLogs.put(foodLog);
      
      // Update decrypted cache for instant UI feedback
      await db.decryptedLogs.put({
        id: logId,
        userId,
        timestamp,
        mealType,
        totalCalories,
        items,
        notes,
        imageUrl,
        imageIv,
        version: 1
      });

      // 3. Add to Sync Outbox (Write-Ahead Log pattern)
      await db.syncOutbox.add({
        userId,
        table: 'foodLogs',
        entityId: logId,
        operation: 'PUT',
        payload: foodLog,
        timestamp: Date.now(),
        status: 'pending'
      });

      // 4. Update local favorites and portion memory (background)
      for (const item of items) {
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
        
        // Task 1.3: Store portion memory in semantic cache
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
          }, true); // Mark as user portion
        }
      }

      // 5. Trigger background sync
      triggerSync(userId, vaultKey).catch(console.error);
      
      onSuccess?.();
    } catch (err) {
      console.error('Save failed', err);
      onError?.(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  }, [session, vaultKey, encryptLog, triggerSync, onSuccess, onError]);

  return {
    saveLog,
    isSaving
  };
}
