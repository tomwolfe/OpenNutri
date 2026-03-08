'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/hooks/useEncryption';
import { db, type LocalUserRecipe } from '@/lib/db-local';
import { useLiveQuery } from 'dexie-react-hooks';

/**
 * useRecipes Hook
 * 
 * Manages E2E encrypted custom recipes.
 * Handles CRUD operations with automatic background sync.
 */
export function useRecipes() {
  const { data: session } = useSession();
  const { vaultKey, encryptBinary, decryptBinary, isReady } = useEncryption();
  const [isSaving, setIsSaving] = useState(false);

  // Live query for all user recipes
  const recipes = useLiveQuery(
    async () => {
      if (!session?.user?.id) return [];
      return await db.userRecipes
        .where('userId')
        .equals(session.user.id)
        .reverse()
        .sortBy('updatedAt');
    },
    [session?.user?.id]
  );

  /**
   * Save a new recipe
   */
  const saveRecipe = useCallback(async (params: {
    name: string;
    description?: string;
    items: Array<{
      foodName: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fdcId?: number;
    }>;
  }) => {
    if (!session?.user?.id || !vaultKey) {
      throw new Error('Not authenticated or vault locked');
    }

    try {
      setIsSaving(true);

      // 1. Serialize items
      const jsonStr = JSON.stringify(params.items);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonStr);

      // 2. Encrypt
      const { ciphertext, iv } = await encryptBinary(data);

      // 3. Store in Dexie
      const recipe: LocalUserRecipe = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: params.name,
        description: params.description,
        encryptedData: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        encryptionIv: btoa(String.fromCharCode(...iv)),
        updatedAt: new Date().toISOString(),
        synced: 0,
      };

      await db.userRecipes.put(recipe);
      return recipe;
    } finally {
      setIsSaving(false);
    }
  }, [session, vaultKey, encryptBinary]);

  /**
   * Get decrypted recipe items
   */
  const getRecipeItems = useCallback(async (recipe: LocalUserRecipe) => {
    if (!vaultKey) throw new Error('Vault locked');

    const binaryData = Uint8Array.from(atob(recipe.encryptedData), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(recipe.encryptionIv), c => c.charCodeAt(0));

    const decrypted = await decryptBinary(binaryData.buffer, iv);
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  }, [vaultKey, decryptBinary]);

  /**
   * Delete a recipe
   */
  const deleteRecipe = useCallback(async (id: string) => {
    await db.userRecipes.delete(id);
    // Note: In a full implementation, we might want to mark as deleted for sync
  }, []);

  return {
    recipes: recipes || [],
    isLoading: recipes === undefined,
    isSaving,
    saveRecipe,
    getRecipeItems,
    deleteRecipe,
  };
}
