'use client';

import { useState, useEffect } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import Image from 'next/image';
import { Loader2, AlertCircle } from 'lucide-react';

interface EncryptedImageProps {
  imageUrl: string;
  imageIv: string;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
}

/**
 * EncryptedImage Component
 * 
 * Fetches and decrypts images client-side.
 * Used for the "Visual Diary" feature while maintaining Zero-Knowledge.
 */
export function EncryptedImage({ imageUrl, imageIv, alt, fill, className, sizes }: EncryptedImageProps) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { decryptBinary, vaultKey, isReady } = useEncryption();

  useEffect(() => {
    let objectUrl: string | null = null;

    async function decrypt() {
      if (!isReady || !vaultKey || !imageUrl || !imageIv) {
        setIsLoading(false);
        return;
      }
      
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error('Failed to fetch image');
        const ciphertext = await response.arrayBuffer();
        
        // Convert base64 IV back to Uint8Array
        const binaryIv = atob(imageIv);
        const ivArr = new Uint8Array(binaryIv.length);
        for (let i = 0; i < binaryIv.length; i++) {
          ivArr[i] = binaryIv.charCodeAt(i);
        }
        
        const decrypted = await decryptBinary(ciphertext, ivArr);
        
        const blob = new Blob([decrypted], { type: 'image/webp' });
        objectUrl = URL.createObjectURL(blob);
        setDecryptedUrl(objectUrl);
      } catch (err) {
        console.error('Failed to decrypt image', err);
        setError('Decryption failed');
      } finally {
        setIsLoading(false);
      }
    }

    decrypt();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl, imageIv, vaultKey, decryptBinary, isReady]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-gray-50 border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !decryptedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-red-50 border border-red-100 rounded-md p-1">
        <AlertCircle className="h-4 w-4 text-red-400 mb-1" />
        <span className="text-[8px] text-red-500 text-center leading-tight">Image Private</span>
      </div>
    );
  }

  return (
    <Image
      src={decryptedUrl}
      alt={alt}
      fill={fill}
      className={className}
      sizes={sizes}
    />
  );
}
