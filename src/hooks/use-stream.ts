/**
 * useStreamableText Hook
 *
 * Helper hook for processing streaming text responses.
 * Provided for compatibility - currently not used in snap-to-log.tsx
 * as we handle streaming directly for better control.
 */

'use client';

import { useState, useCallback } from 'react';

export interface StreamChunk {
  type: 'status' | 'result' | 'error' | 'delta';
  [key: string]: unknown;
}

export interface UseStreamOptions {
  /** Callback when stream completes */
  onComplete?: (result: unknown) => void;
  /** Callback on stream error */
  onError?: (error: string) => void;
  /** Callback on status update */
  onStatus?: (status: string) => void;
}

/**
 * Parse Vercel AI SDK stream format
 * Format: "0:{...}\n"
 */
function parseStreamChunk(chunk: string): StreamChunk | null {
  const lines = chunk.split('\n').filter((line) => line.trim());

  for (const line of lines) {
    if (line.startsWith('0:')) {
      try {
        const jsonStr = line.slice(2);
        return JSON.parse(jsonStr) as StreamChunk;
      } catch {
        // Ignore partial JSON
        return null;
      }
    }
  }

  return null;
}

/**
 * Process streaming response from AI endpoint
 */
export async function processStream(
  response: Response,
  callbacks: {
    onChunk?: (chunk: StreamChunk) => void;
    onComplete?: (result: unknown) => void;
    onError?: (error: string) => void;
  }
): Promise<void> {
  const stream = response.body;
  if (!stream) {
    throw new Error('No stream available');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const parsed = parseStreamChunk(chunk);

      if (parsed) {
        callbacks.onChunk?.(parsed);

        if (parsed.type === 'result') {
          callbacks.onComplete?.(parsed);
        } else if (parsed.type === 'error') {
          const errorChunk = parsed as StreamChunk & { error: string };
          callbacks.onError?.(errorChunk.error);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Stream was canceled
      return;
    }
    throw error;
  }
}

/**
 * Hook for streaming AI responses (optional - for future use)
 */
export function useStreamableText(options: UseStreamOptions = {}) {
  const [data, setData] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stream = useCallback(
    async (url: string, body: FormData) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(url, {
          method: 'POST',
          body,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Stream failed');
        }

        await processStream(response, {
          onChunk: (chunk) => {
            if (chunk.type === 'status') {
              options.onStatus?.(chunk.message as string);
            }
            setData(chunk);
          },
          onComplete: (result) => {
            options.onComplete?.(result);
          },
          onError: (errorMessage) => {
            setError(errorMessage);
            options.onError?.(errorMessage);
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Stream failed';
        setError(errorMessage);
        options.onError?.(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  return {
    data,
    isLoading,
    error,
    stream,
  };
}
