import { describe, test, expect } from 'vitest';
import { WeightKalmanFilter } from '../src/lib/coaching/kalman';

describe('WeightKalmanFilter', () => {
  test('should filter a single weight measurement', () => {
    const kf = new WeightKalmanFilter(70);
    const result = kf.update(72);
    expect(result).toBeCloseTo(72, 1);
  });

  test('should track velocity (rate of change)', () => {
    const kf = new WeightKalmanFilter(70, 0.01, 1.0);
    kf.update(70);
    kf.update(72);
    kf.update(71);
    const velocity = kf.getVelocity();
    expect(velocity).toBeCloseTo(-0.5, 1);
  });

  test('should predict future weight', () => {
    const kf = new WeightKalmanFilter(70, 0.01, 1.0);
    kf.update(70);
    kf.update(71);
    const prediction = kf.predictFutureWeight(7);
    expect(prediction).toBeCloseTo(71.5, 1);
  });

  test('should handle high sodium days with increased noise', () => {
    const kf = new WeightKalmanFilter(70, 0.01, 5.0);
    const result = kf.update(72, 5.0);
    expect(result).toBeCloseTo(72, 1);
  });

  test('should filter multiple entries', () => {
    const entries = [68, 70, 72, 69, 71];
    const results = WeightKalmanFilter.filter(entries, 0.01, 1.0);
    expect(results.length).toBe(5);
    expect(results[0].weight).toBeCloseTo(68, 1);
    expect(results[results.length - 1].weight).toBeCloseTo(71, 1);
  });

  test('should handle empty entries array', () => {
    const results = WeightKalmanFilter.filter([], 0.01, 1.0);
    expect(results).toEqual([]);
  });
});