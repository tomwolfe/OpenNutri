/**
 * Simple Kalman Filter for Weight Tracking
 *
 * Separates "True Weight" (body mass) from "Measured Weight" (noise/water weight).
 *
 * A Kalman filter is an optimal estimator that minimizes the mean square error.
 * For weight tracking, it's superior to a simple moving average because it
 * dynamically adjusts to the "noise" in daily measurements.
 */

/**
 * Advanced Kalman Filter for Weight Tracking (2D State)
 *
 * Tracks both "True Weight" and "Velocity" (rate of change).
 * 
 * Separates body mass from water weight noise and provides 
 * a more accurate trend prediction.
 */

export class WeightKalmanFilter {
  private x: [number, number]; // State: [weight, velocity]
  private p: [[number, number], [number, number]]; // Covariance matrix
  private q: [[number, number], [number, number]]; // Process noise
  private r: number; // Default measurement noise

  /**
   * @param initialWeight - The first weight measurement
   * @param qWeight - Process noise for weight
   * @param r - Measurement noise
   */
  constructor(initialWeight: number, qWeight = 0.001, r = 1.0) {
    this.x = [initialWeight, 0];
    this.p = [[1, 0], [0, 1]];
    
    // Process noise: how much weight and velocity can change
    const qVelocity = qWeight / 100;
    this.q = [[qWeight, 0], [0, qVelocity]];
    
    this.r = r; // Base measurement noise
  }

  /**
   * Update the filter with a new measurement
   * @param measurement - New scale reading
   * @param customNoise - Optional noise override (e.g. for high sodium days)
   * @returns The new estimated "true" weight
   */
  public update(measurement: number, customNoise?: number): number {
    const r = customNoise !== undefined ? customNoise : this.r;

    // 1. Predict
    // x = F * x (where F = [1 1; 0 1] for weight + velocity)
    const newWeight = this.x[0] + this.x[1];
    const newVelocity = this.x[1];
    this.x = [newWeight, newVelocity];

    // p = F * p * F' + q
    const p00 = this.p[0][0] + this.p[0][1] + this.p[1][0] + this.p[1][1] + this.q[0][0];
    const p01 = this.p[0][1] + this.p[1][1] + this.q[0][1];
    const p10 = this.p[1][0] + this.p[1][1] + this.q[1][0];
    const p11 = this.p[1][1] + this.q[1][1];
    this.p = [[p00, p01], [p10, p11]];

    // 2. Update
    // y = z - H * x (where H = [1 0])
    const y = measurement - this.x[0];

    // s = H * p * H' + r
    const s = this.p[0][0] + r;

    // k = p * H' * s^-1
    const k: [number, number] = [this.p[0][0] / s, this.p[1][0] / s];

    // x = x + k * y
    this.x[0] = this.x[0] + k[0] * y;
    this.x[1] = this.x[1] + k[1] * y;

    // p = (I - k * H) * p
    const newP00 = (1 - k[0]) * this.p[0][0];
    const newP01 = (1 - k[0]) * this.p[0][1];
    const newP10 = -k[1] * this.p[0][0] + this.p[1][0];
    const newP11 = -k[1] * this.p[0][1] + this.p[1][1];
    this.p = [[newP00, newP01], [newP10, newP11]];

    return this.x[0];
  }

  /**
   * Get the current estimated rate of change (kg/day)
   */
  public getVelocity(): number {
    return this.x[1];
  }

  /**
   * Predict weight n steps (days) into the future
   * @param steps - Number of days to look ahead
   */
  public predictFutureWeight(steps: number): number {
    // Current weight + (current velocity * steps)
    return this.x[0] + (this.x[1] * steps);
  }

  /**
   * Process a series of weights with optional metadata
   */
  public static filter(
    entries: Array<number | { 
      weight: number; 
      highSodium?: boolean; 
      highCarbs?: boolean;
      holiday?: boolean; 
      traveling?: boolean;
    }>,
    qWeight?: number,
    r?: number
  ): { weight: number; trend: number; prediction7Days: number }[] {
    if (entries.length === 0) return [];
    
    const firstEntry = entries[0];
    const initialWeight = typeof firstEntry === 'number' ? firstEntry : firstEntry.weight;
    
    const kf = new WeightKalmanFilter(initialWeight, qWeight, r);
    return entries.map(e => {
      const isNum = typeof e === 'number';
      const weightVal = isNum ? e : e.weight;
      
      let noise = r !== undefined ? r : 1.5; // Default measurement noise
      if (!isNum) {
        if (e.highSodium) noise += 2.0;
        if (e.highCarbs) noise += 1.5;
        if (e.holiday) noise += 3.0;
        if (e.traveling) noise += 2.0;
      }

      const weight = kf.update(weightVal, isNum ? r : noise);
      return {
        weight,
        trend: kf.getVelocity(),
        prediction7Days: kf.predictFutureWeight(7)
      };
    });
  }
}
