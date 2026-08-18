import { describe, test, expect } from 'vitest';
import { linearRegression, multipleLinearRegression, detectTrend, calculateCalorieAdjustment } from '../src/lib/coaching/linear-regression';

describe('linearRegression', () => {
  test('should calculate correct slope and intercept for known dataset', () => {
    // y = 2x + 1
    const points: Array<{ x: number; y: number }> = [
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 },
    ];
    const result = linearRegression(points);
    expect(result.slope).toBeCloseTo(2, 10);
    expect(result.intercept).toBeCloseTo(1, 10);
    expect(result.rSquared).toBeCloseTo(1, 10);
    
    const prediction = result.prediction(5);
    expect(prediction).toBeCloseTo(11, 10);
  });

  test('should handle constant data (zero variance)', () => {
    const points: Array<{ x: number; y: number }> = [
      { x: 0, y: 5 },
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ];
    const result = linearRegression(points);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
  });

  test('should return zero result for less than 2 points', () => {
    const result = linearRegression([{ x: 0, y: 1 }]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(1);
  });
});

describe('multipleLinearRegression', () => {
  test('should calculate multiple regression with known dataset', () => {
    // y = 3x1 + 2x2 + 1x3 + 5
    const points: Array<{ x1: number; x2: number; x3: number; y: number }> = [
      { x1: 1, x2: 1, x3: 1, y: 11 },
      { x1: 2, x2: 2, x3: 2, y: 18 },
      { x1: 3, x2: 3, x3: 3, y: 25 },
      { x1: 4, x2: 4, x3: 4, y: 32 },
    ];
    const result = multipleLinearRegression(points);
    expect(result.coefficients.calories).toBeCloseTo(3, 0.1);
    expect(result.coefficients.proteinPercent).toBeCloseTo(2, 0.1);
    expect(result.coefficients.carbsPercent).toBeCloseTo(1, 0.1);
    expect(result.rSquared).toBeGreaterThan(0.9);
  });

  test('should return insufficient data result for less than 10 points', () => {
    const result = multipleLinearRegression([
      { x1: 1, x2: 1, x3: 1, y: 5 },
    ]);
    expect(result.coefficients.calories).toBe(0);
    expect(result.insufficientData).toBeTruthy();
  });
});

describe('detectTrend', () => {
  test('should detect increasing trend', () => {
    const result = { slope: 0.15, intercept: 0, rSquared: 0.8, correlation: 0.9, prediction: () => 0 };
    const trend = detectTrend(result, 0.1);
    expect(trend).toBe('increasing');
  });

  test('should detect decreasing trend', () => {
    const result = { slope: -0.15, intercept: 0, rSquared: 0.8, correlation: 0.9, prediction: () => 0 };
    const trend = detectTrend(result, 0.1);
    expect(trend).toBe('decreasing');
  });

  test('should detect stable trend', () => {
    const result = { slope: 0.02, intercept: 0, rSquared: 0.8, correlation: 0.9, prediction: () => 0 };
    const trend = detectTrend(result, 0.1);
    expect(trend).toBe('stable');
  });
});

describe('calculateCalorieAdjustment', () => {
  test('should adjust calories for weight loss with increasing trend', () => {
    const adj = calculateCalorieAdjustment(2000, 'increasing' as const, 'lose' as const, -0.5);
    expect(adj).toBeLessThan(2000);
  });

  test('should adjust calories for weight gain with decreasing trend', () => {
    const adj = calculateCalorieAdjustment(2000, 'decreasing' as const, 'gain' as const, 0.2);
    expect(adj).toBeGreaterThan(2000);
  });
});