import { describe, test, expect } from 'vitest';
import { calculateTDEE, calculateBMR, calculateAdaptiveTDEE, compareTDEEWithProfile } from '../src/lib/tdee';

describe('tdee.ts', () => {
  test('should calculate BMR using Mifflin-St Jeor equation', () => {
    // Mifflin-St Jeor: BMR = 10 * weight + 6.25 * height - 5 * age + s (where s = +5 for male, -161 for female)
    const bmrMale = calculateBMR(80, 180, 30, 'male');
    expect(bmrMale).toBeCloseTo(1845, -1);
    
    const bmrFemale = calculateBMR(80, 180, 30, 'female');
    expect(bmrFemale).toBeCloseTo(1644, -1);
  });

  test('should calculate TDEE with activity multiplier', () => {
    const tdee = calculateTDEE(180, 70, 30, 'male', 'active');
    expect(tdee).toBeGreaterThan(2000);
  });

  test('should calculate adaptive TDEE', () => {
    const adaptive = calculateAdaptiveTDEE(180, 70, 30, 'male', 'active', [70, 71, 72, 69, 71]);
    expect(adaptive).toBeGreaterThan(0);
  });

  test('should compare TDEE with profile', () => {
    const result = compareTDEEWithProfile(2500, 180, 70, 30, 'male', 'active', 'lose');
    expect(result).toHaveProperty('calorieAdjustment');
  });
});