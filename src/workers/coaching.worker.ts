/**
 * Coaching Analysis Web Worker
 *
 * Offloads heavy regression and trend analysis from the main thread.
 * Ensures UI remains responsive while processing large datasets.
 */

import { generateCoachingInsights, type IntakePoint, type MacroTargets } from '@/lib/coaching/linear-regression';
import { calculateAdaptiveTDEE } from '@/lib/tdee';

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  try {
    switch (type) {
      case 'GENERATE_INSIGHTS': {
        const { weightData, intakeData, targets, stepsYesterday, userProfile } = payload;

        // Run the heavy analysis
        const insights = generateCoachingInsights(
          weightData,
          intakeData as IntakePoint[],
          targets as MacroTargets
        );

        // Task 3.2: Calculate adaptive TDEE if steps data available
        if (stepsYesterday !== null && userProfile) {
          const { calculateTDEEFromProfile } = await import('@/lib/tdee');
          const latestWeight = weightData[weightData.length - 1]?.weight;
          
          if (latestWeight) {
            const baseTdeeResult = calculateTDEEFromProfile(userProfile, latestWeight);
            
            if (baseTdeeResult) {
              const adaptiveResult = calculateAdaptiveTDEE(
                baseTdeeResult.tdee,
                stepsYesterday,
                insights.find(i => i.type === 'weight')?.trend === 'increasing' ? 0.1 : 
                insights.find(i => i.type === 'weight')?.trend === 'decreasing' ? -0.1 : 0,
                targets.weightGoal
              );

              // Add adaptive TDEE insight
              insights.push({
                id: `adaptive-tdee-${Date.now()}`,
                type: 'adaptive_tdee',
                trend: 'stable',
                confidence: 0.85,
                recommendation: `Today's target: ${adaptiveResult.adjustedTdee} kcal (${adaptiveResult.explanation})`,
                dataPoints: stepsYesterday,
                explanation: adaptiveResult.explanation !== 'No adjustment needed' ? adaptiveResult.explanation : undefined,
              });
            }
          }
        }

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
