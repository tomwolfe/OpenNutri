/**
 * Linear and Multiple Linear Regression for Adaptive Coaching
 *
 * Implements:
 * - Simple linear regression (least squares)
 * - Multiple linear regression for macro impact analysis
 * - Kalman Filter for robust weight smoothing
 */

import { WeightKalmanFilter } from './kalman';

export interface DataPoint {
  x: number;
  y: number;
}

export interface MultipleDataPoint {
  x1: number; // Calories
  x2: number; // Protein %
  x3: number; // Carbs %
  y: number;  // Weight change
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  correlation: number;
  prediction: (x: number) => number;
}

export interface MultipleRegressionResult {
  coefficients: {
    calories: number;
    proteinPercent: number;
    carbsPercent: number;
    intercept: number;
  };
  rSquared: number;
  adjustedRSquared: number;
  prediction: (calories: number, proteinPercent: number, carbsPercent: number) => number;
  insights: {
    proteinImpact: 'positive' | 'negative' | 'neutral';
    carbsImpact: 'positive' | 'negative' | 'neutral';
    recommendation: string;
  };
}

/**
 * Calculate linear regression using least squares method
 */
export function linearRegression(points: DataPoint[]): RegressionResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0, correlation: 0, prediction: () => 0 };

  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - xMean) * (point.y - yMean);
    denominator += Math.pow(point.x - xMean, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;

  let ssTot = 0, ssRes = 0;
  for (const point of points) {
    const yPred = slope * point.x + intercept;
    ssTot += Math.pow(point.y - yMean, 2);
    ssRes += Math.pow(point.y - yPred, 2);
  }

  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared, correlation: Math.sqrt(rSquared), prediction: (x: number) => slope * x + intercept };
}

/**
 * Multiple Linear Regression using OLS
 */
export function multipleLinearRegression(points: MultipleDataPoint[]): MultipleRegressionResult {
  const n = points.length;
  if (n < 10) return { coefficients: { calories: 0, proteinPercent: 0, carbsPercent: 0, intercept: 0 }, rSquared: 0, adjustedRSquared: 0, prediction: () => 0, insights: { proteinImpact: 'neutral', carbsImpact: 'neutral', recommendation: 'Insufficient data' } };

  const xtx = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const xty = new Array(4).fill(0);

  for (const p of points) {
    const row = [1, p.x1, p.x2, p.x3];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) xtx[i][j] += row[i] * row[j];
      xty[i] += row[i] * p.y;
    }
  }

  const coefficients = solveLinearSystem(xtx, xty);
  if (!coefficients) return { coefficients: { calories: 0, proteinPercent: 0, carbsPercent: 0, intercept: 0 }, rSquared: 0, adjustedRSquared: 0, prediction: () => 0, insights: { proteinImpact: 'neutral', carbsImpact: 'neutral', recommendation: 'Data error' } };

  const [intercept, b1, b2, b3] = coefficients;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;
  let ssTot = 0, ssRes = 0;

  for (const p of points) {
    const yPred = intercept + b1 * p.x1 + b2 * p.x2 + b3 * p.x3;
    ssTot += Math.pow(p.y - yMean, 2);
    ssRes += Math.pow(p.y - yPred, 2);
  }

  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  const proteinImpact = b2 > 0.005 ? 'positive' : b2 < -0.005 ? 'negative' : 'neutral';
  const carbsImpact = b3 > 0.005 ? 'positive' : b3 < -0.005 ? 'negative' : 'neutral';

  return {
    coefficients: { calories: b1, proteinPercent: b2, carbsPercent: b3, intercept },
    rSquared,
    adjustedRSquared: 1 - (1 - rSquared) * (n - 1) / (n - 4),
    prediction: (c, p, cb) => intercept + b1 * c + b2 * p + b3 * cb,
    insights: {
      proteinImpact,
      carbsImpact,
      recommendation: proteinImpact === 'positive' ? 'High protein correlates with better loss.' : carbsImpact === 'negative' ? 'Lower carbs seem more efficient.' : 'Macro balance looks optimal.'
    }
  };
}

function solveLinearSystem(A: number[][], B: number[]): number[] | null {
  const n = B.length;
  const matrix = A.map((row, i) => [...row, B[i]]);

  for (let i = 0; i < n; i++) {
    let max = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(matrix[k][i]) > Math.abs(matrix[max][i])) max = k;
    [matrix[i], matrix[max]] = [matrix[max], matrix[i]];
    if (Math.abs(matrix[i][i]) < 1e-10) return null;

    for (let k = i + 1; k < n; k++) {
      const c = -matrix[k][i] / matrix[i][i];
      for (let j = i; j <= n; j++) matrix[k][j] = i === j ? 0 : matrix[k][j] + c * matrix[i][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = matrix[i][n] / matrix[i][i];
    for (let k = i - 1; k >= 0; k--) matrix[k][n] -= matrix[k][i] * x[i];
  }
  return x;
}

export function detectTrend(result: RegressionResult, threshold: number = 0.1): 'increasing' | 'decreasing' | 'stable' {
  return result.slope > threshold ? 'increasing' : result.slope < -threshold ? 'decreasing' : 'stable';
}

export function calculateCalorieAdjustment(currentCalories: number, weightTrend: 'increasing' | 'decreasing' | 'stable', targetTrend: 'lose' | 'maintain' | 'gain', weightChangePerWeek: number): number {
  const targetWeekly = { lose: -0.5, maintain: 0, gain: 0.25 }[targetTrend];
  const dailyBase = (targetWeekly * 7700) / 7;
  let adj = dailyBase;

  if (targetTrend === 'lose' && weightTrend === 'increasing') adj -= 200;
  else if (targetTrend === 'gain' && weightTrend === 'decreasing') adj += 200;
  else if (targetTrend === 'maintain' && weightTrend !== 'stable') adj += weightTrend === 'increasing' ? -150 : 150;

  return Math.round(adj - (weightChangePerWeek * 110));
}

export interface IntakePoint { timestamp: number; calories: number; protein: number; carbs: number; fat: number; }
export interface MacroTargets { calories: number; protein: number; carbs: number; fat: number; weightGoal: 'lose' | 'maintain' | 'gain'; }
export interface CoachingAction { type: string; label: string; description: string; payload: unknown; }
export interface CoachingInsight { 
  id: string; 
  type: string; 
  trend: 'increasing' | 'decreasing' | 'stable'; 
  confidence: number; 
  recommendation: string; 
  dataPoints: number; 
  action?: CoachingAction; 
  suggestedCalories?: number; 
  suggestedProtein?: number; 
}

export function generateCoachingInsights(weightData: Array<{ timestamp: number; weight: number }>, intakeData: IntakePoint[], targets: MacroTargets): CoachingInsight[] {
  if (weightData.length < 3 || intakeData.length < 3) return [];

  weightData.sort((a, b) => a.timestamp - b.timestamp);
  intakeData.sort((a, b) => a.timestamp - b.timestamp);
  const start = Math.min(weightData[0].timestamp, intakeData[0].timestamp);

  const smoothedResults = WeightKalmanFilter.filter(weightData.map(d => d.weight), 0.015, 1.2);
  const smoothedWeights = smoothedResults.map(r => r.weight);
  const weightPoints = weightData.map((d, i) => ({ x: (d.timestamp - start) / 86400000, y: smoothedWeights[i] }));
  const caloriePoints = intakeData.map(d => ({ x: (d.timestamp - start) / 86400000, y: d.calories }));

  const wReg = linearRegression(weightPoints);
  const wTrend = detectTrend(wReg, 0.05);
  const weeklyChange = wReg.slope * 7;

  const avgCal = intakeData.reduce((s, d) => s + d.calories, 0) / intakeData.length;
  const calAdj = calculateCalorieAdjustment(avgCal, wTrend, targets.weightGoal, weeklyChange);
  const suggCal = Math.round(avgCal + calAdj);

  const insights: CoachingInsight[] = [
    {
      id: `weight-${Date.now()}`,
      type: 'weight',
      trend: wTrend,
      confidence: Math.abs(wReg.rSquared),
      recommendation: `Weight is ${wTrend}. Change rate: ${weeklyChange.toFixed(2)} kg/week.`,
      dataPoints: weightData.length
    },
    {
      id: `calorie-${Date.now()}`,
      type: 'calorie',
      trend: detectTrend(linearRegression(caloriePoints), 50),
      confidence: 0.8,
      recommendation: `Targeting ${suggCal} cal for ${targets.weightGoal}.`,
      dataPoints: intakeData.length,
      suggestedCalories: suggCal,
      action: { type: 'UPDATE_TARGET', label: `Set to ${suggCal}`, description: 'Adjust target based on trend.', payload: { calorieTarget: suggCal } }
    }
  ];

  return insights;
}
