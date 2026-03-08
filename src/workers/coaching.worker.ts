/**
 * Coaching Analysis Web Worker
 * 
 * Offloads heavy regression and trend analysis from the main thread.
 * Ensures UI remains responsive while processing large datasets.
 */

import { generateCoachingInsights } from '@/lib/coaching/linear-regression';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'GENERATE_INSIGHTS': {
        const { weightData, intakeData, targets } = payload;
        
        // Run the heavy analysis
        const insights = generateCoachingInsights(
          weightData,
          intakeData,
          targets
        );

        self.postMessage({ 
          type: 'GENERATE_INSIGHTS_SUCCESS', 
          payload: insights 
        });
        break;
      }

      default:
        console.warn(`CoachingWorker: Unknown message type ${type}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown coaching worker error';
    self.postMessage({ 
      type: 'ERROR', 
      payload: message
    });
  }
};
