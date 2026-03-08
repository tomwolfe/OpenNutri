/**
 * Share Target Page
 *
 * Handles images shared from other apps (e.g., phone gallery)
 * Queues the image for offline upload and redirects to dashboard
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { addToOfflineQueue } from '@/lib/offline-queue';

export default function ShareTargetPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function handleShare() {
      try {
        // Check if this is a share target launch
        if (!('launchQueue' in window)) {
          throw new Error('Launch queue API not supported');
        }

        const launchQueue = window as Window & { launchQueue?: { setConsumer: (fn: (params: { files?: Array<{ kind: string; getFile: () => Promise<File> }> }) => Promise<void>) => void } };
        
        launchQueue.launchQueue?.setConsumer(async (launchParams: { files?: Array<{ kind: string; getFile: () => Promise<File> }> }) => {
          if (!launchParams.files || launchParams.files.length === 0) {
            throw new Error('No files shared');
          }

          const file = launchParams.files[0];
          
          // Handle the shared file
          if (file.kind !== 'file') {
            throw new Error('Shared item is not a file');
          }

          const fileHandle = await file.getFile();
          
          // Validate it's an image
          if (!fileHandle.type.startsWith('image/')) {
            throw new Error('Shared file is not an image');
          }

          // Queue for offline upload
          const queueId = await addToOfflineQueue(
            fileHandle,
            fileHandle.name || 'shared-image.png',
            'unclassified'
          );

          if (queueId) {
            setMessage('Image queued for analysis! Redirecting...');
            setStatus('success');
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
              router.push('/dashboard?action=snap');
            }, 1500);
          } else {
            throw new Error('Failed to queue image');
          }
        });
      } catch (error) {
        console.error('Share target error:', error);
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Failed to process shared image');
        
        // Redirect to dashboard anyway
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      }
    }

    handleShare();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
        {status === 'processing' && (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Processing Share</h1>
            <p className="text-gray-600">Preparing your image for analysis...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Image Received!</h1>
            <p className="text-gray-600">{message}</p>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Share Failed</h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </>
        )}
      </div>
    </div>
  );
}
