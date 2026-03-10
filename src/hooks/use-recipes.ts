'use client';

import { useState, useCallback } from 'react';
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
  const { vaultKey, encryptBinary, decryptBinary } = useEncryption();
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Get decrypted recipe details (metadata + items)
   */
  const getRecipeDetails = useCallback(async (recipe: LocalUserRecipe) => {
    if (!vaultKey) throw new Error('Vault locked');

    const binaryData = Uint8Array.from(atob(recipe.encryptedData), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(recipe.encryptionIv), c => c.charCodeAt(0));

    const decrypted = await decryptBinary(binaryData.buffer, iv);
    const decoder = new TextDecoder();
    const data = JSON.parse(decoder.decode(decrypted));

    // Handle migration: if data is an array, it's the old format (just items)
    if (Array.isArray(data)) {
      return {
        name: recipe.name, // Plaintext fallback for old entries
        description: recipe.description,
        items: data
      };
    }

    return data; // New format already contains name, description, items
  }, [vaultKey, decryptBinary]);

  // Live query for all user recipes with automatic decryption
  const decryptedRecipes = useLiveQuery(
    async () => {
      if (!session?.user?.id) return [];
      const localRecipes = await db.userRecipes
        .where('userId')
        .equals(session.user.id)
        .reverse()
        .sortBy('updatedAt');

      // Decrypt on the fly for UI if vault is ready
      if (vaultKey) {
        return Promise.all(localRecipes.map(async r => {
          try {
            const details = await getRecipeDetails(r);
            return { 
              ...r, 
              name: details.name || r.name, 
              description: details.description || r.description,
              items: details.items || []
            };
          } catch (err) {
            console.warn(`Failed to decrypt recipe ${r.id}`, err);
            return r;
          }
        }));
      }

      return localRecipes;
    },
    [session?.user?.id, vaultKey, getRecipeDetails]
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

      // 1. Serialize everything including metadata
      const payload = {
        name: params.name,
        description: params.description,
        items: params.items,
      };
      const jsonStr = JSON.stringify(payload);
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonStr);

      // 2. Encrypt
      const { ciphertext, iv } = await encryptBinary(data);

      // 3. Store in Dexie
      const ciphertextArray = new Uint8Array(ciphertext);
      const ivArray = new Uint8Array(iv);
      let encryptedDataStr = '';
      let ivStr = '';
      for (let i = 0; i < ciphertextArray.byteLength; i++) {
        encryptedDataStr += String.fromCharCode(ciphertextArray[i]);
      }
      for (let i = 0; i < ivArray.byteLength; i++) {
        ivStr += String.fromCharCode(ivArray[i]);
      }

      const recipe: LocalUserRecipe = {
        id: crypto.randomUUID(),
        userId: session.user.id,
        name: 'Encrypted Recipe', // Masked for server
        description: 'Encrypted',   // Masked for server
        encryptedData: btoa(encryptedDataStr),
        encryptionIv: btoa(ivStr),
        version: 1,
        deviceId: typeof window !== 'undefined' ? localStorage.getItem('opennutri_device_id') : null,
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
   * Delete a recipe
   */
  const deleteRecipe = useCallback(async (id: string) => {
    await db.userRecipes.delete(id);
    // Note: In a full implementation, we might want to mark as deleted for sync
  }, []);

  return {
    recipes: decryptedRecipes || [],
    isLoading: decryptedRecipes === undefined,
    isSaving,
    saveRecipe,
    getRecipeDetails,
    deleteRecipe,
  };
}
