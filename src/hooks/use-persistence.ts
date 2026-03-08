'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/hooks/useEncryption';
import { useDailyLogs } from '@/hooks/use-daily-logs';
import { db } from '@/lib/db-local';
import { DraftItem } from '@/types/food';

interface UsePersistenceOptions {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function usePersistence({ onSuccess, onError }: UsePersistenceOptions = {}) {
  const { data: session } = useSession();
  const { vaultKey, encryptLog } = useEncryption();
  const { triggerSync } = useDailyLogs(new Date(), session?.user?.id, vaultKey);
  const [isSaving, setIsSaving] = useState(false);

  const saveLog = useCallback(async (
    items: DraftItem[], 
    mealType: string, 
    imageUrl: string | null, 
    imageIv: string | null
  ) => {
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
          mealType,
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
          mealType: encryptedData ? 'encrypted' : mealType,
          items: encryptedData ? [] : items,
          totalCalories: encryptedData ? 0 : totalCalories,
          notes: encryptedData ? 'encrypted' : notes,
          imageUrl: encryptedData ? null : imageUrl,
          encryptedData,
          encryptionIv,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');

      if (session?.user?.id && vaultKey) {
        triggerSync(session.user.id, vaultKey).catch(console.error);
      }
      
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
