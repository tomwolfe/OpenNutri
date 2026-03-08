/**
 * Simple Kalman Filter for Weight Tracking
 *
 * Separates "True Weight" (body mass) from "Measured Weight" (noise/water weight).
 *
 * A Kalman filter is an optimal estimator that minimizes the mean square error.
 * For weight tracking, it's superior to a simple moving average because it
 * dynamically adjusts to the "noise" in daily measurements.
 */

export class WeightKalmanFilter {
  private x: number; // State (Estimated weight)
  private p: number; // Error covariance (Estimate uncertainty)
  private q: number; // Process noise covariance (How much weight can realistically change per day)
  private r: number; // Measurement noise covariance (How much scale/water noise we expect)

  /**
   * @param initialWeight - The first weight measurement
   * @param processNoise - Default 0.01 (Weight change is slow)
   * @param measurementNoise - Default 1.5 (Daily water weight/scale noise is high)
   */
  constructor(initialWeight: number, processNoise: number = 0.01, measurementNoise: number = 1.5) {
    this.x = initialWeight;
    this.p = 1.0; // Start with some initial uncertainty
    this.q = processNoise;
    this.r = measurementNoise;
  }

  /**
   * Update the filter with a new measurement
   * @param measurement - New scale reading
   * @returns The new estimated "true" weight
   */
  public update(measurement: number): number {
    // 1. Predict
    // x = x (State stays same in simple 1D model between steps)
    this.p = this.p + this.q;

    // 2. Update
    const k = this.p / (this.p + this.r); // Kalman gain
    this.x = this.x + k * (measurement - this.x);
    this.p = (1 - k) * this.p;

    return this.x;
  }

  /**
   * Process a series of weights
   */
  public static filter(weights: number[], processNoise: number = 0.01, measurementNoise: number = 1.5): number[] {
    if (weights.length === 0) return [];
    
    const kf = new WeightKalmanFilter(weights[0], processNoise, measurementNoise);
    return weights.map(w => kf.update(w));
  }
}
