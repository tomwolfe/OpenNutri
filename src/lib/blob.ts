/**
 * Vercel Blob Storage Utility
 *
 * Handles image uploads for food logging.
 * Images are stored in Vercel Blob, only URLs are saved to DB.
 */

import { put, del, list } from '@vercel/blob';
import { nanoid } from 'nanoid';

/**
 * Upload a food image to Vercel Blob
 * @param file - The image file (Buffer or Blob)
 * @param userId - User ID for folder organization
 * @returns The public URL of the uploaded image
 */
export async function uploadFoodImage(
  file: Buffer | Blob,
  userId: string
): Promise<string> {
  const timestamp = Date.now();
  const randomId = nanoid(8);
  const filename = `food-${timestamp}-${randomId}.jpg`;
  const pathname = `users/${userId}/${filename}`;

  const blob = await put(pathname, file, {
    access: 'public',
    contentType: 'image/jpeg',
    addRandomSuffix: false,
  });

  return blob.url;
}

/**
 * Delete a food image from Vercel Blob
 * @param url - The URL of the image to delete
 */
export async function deleteFoodImage(url: string): Promise<void> {
  await del(url);
}

/**
 * List all images for a user
 * @param userId - User ID to filter by
 */
export async function listUserImages(userId: string) {
  const { blobs } = await list({
    prefix: `users/${userId}/`,
  });

  return blobs;
}
