'use client';

import { useEffect } from 'react';
import { syncSmallCoreIndex } from '@/lib/ai-local-semantic';

export function SyncInitializer() {
  useEffect(() => {
    // Run after a short delay to not block initial load
    const timer = setTimeout(() => {
      syncSmallCoreIndex();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []);

  return null;
}
