/**
 * Linear Regression for Adaptive Coaching
 *
 * Implements simple linear regression to analyze trends in:
 * - Weight vs Calorie Intake
 * - Weight vs Macronutrient ratios
 * - Progress trends over time
 *
 * Used to provide personalized recommendations.
 */

export interface DataPoint {
  x: number;
  y: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  correlation: number;
  prediction: (x: number) => number;
}

/**
 * Calculate linear regression using least squares method
 * @param points - Array of data points {x, y}
 * @returns Regression results with slope, intercept, and R²
 */
export function linearRegression(points: DataPoint[]): RegressionResult {
  const n = points.length;

  if (n < 2) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      correlation: 0,
      prediction: () => 0,
    };
  }

  // Calculate means
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;

  // Calculate slope and intercept
  let numerator = 0;
  let denominator = 0;

  for (const point of points) {
    numerator += (point.x - xMean) * (point.y - yMean);
    denominator += Math.pow(point.x - xMean, 2);
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;
  const intercept = yMean - slope * xMean;

  // Calculate R² (coefficient of determination)
  let ssTot = 0;
  let ssRes = 0;

  for (const point of points) {
    const yPred = slope * point.x + intercept;
    ssTot += Math.pow(point.y - yMean, 2);
    ssRes += Math.pow(point.y - yPred, 2);
  }

  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;

  // Calculate correlation coefficient
  let xVariance = 0;
  let yVariance = 0;
  let covariance = 0;

  for (const point of points) {
    const xDiff = point.x - xMean;
    const yDiff = point.y - yMean;
    xVariance += xDiff * xDiff;
    yVariance += yDiff * yDiff;
    covariance += xDiff * yDiff;
  }

  const correlation =
    Math.sqrt(xVariance * yVariance) !== 0
      ? covariance / Math.sqrt(xVariance * yVariance)
      : 0;

  return {
    slope,
    intercept,
    rSquared: Math.max(0, rSquared), // Clamp to 0-1
    correlation,
    prediction: (x: number) => slope * x + intercept,
  };
}

/**
 * Calculate moving average for smoothing trends
 * @param values - Array of numeric values
 * @param window - Size of the moving average window
 * @returns Array of smoothed values
 */
export function movingAverage(values: number[], window: number = 7): number[] {
  if (values.length <= window) {
    return values;
  }

  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((sum, v) => sum + v, 0) / slice.length;
    result.push(avg);
  }

  return result;
}

/**
 * Detect trend direction from regression results
 * @param result - Regression result
 * @param threshold - Minimum slope to consider significant (default: 0.1)
 * @returns 'increasing' | 'decreasing' | 'stable'
 */
export function detectTrend(
  result: RegressionResult,
  threshold: number = 0.1
): 'increasing' | 'decreasing' | 'stable' {
  if (result.slope > threshold) {
    return 'increasing';
  } else if (result.slope < -threshold) {
    return 'decreasing';
  }
  return 'stable';
}

/**
 * Calculate recommended calorie adjustment based on weight trend
 * @param currentCalories - Current daily calorie intake
 * @param weightTrend - Current weight trend direction
 * @param targetTrend - Desired weight trend ('lose', 'maintain', 'gain')
 * @param weightChangePerWeek - Current weight change per week (kg)
 * @returns Recommended calorie adjustment
 */
export function calculateCalorieAdjustment(
  currentCalories: number,
  weightTrend: 'increasing' | 'decreasing' | 'stable',
  targetTrend: 'lose' | 'maintain' | 'gain',
  weightChangePerWeek: number
): number {
  // 1 kg of fat ≈ 7700 calories
  // Daily adjustment needed = (target weekly change * 7700) / 7
  const targetWeeklyChange = {
    lose: -0.5, // Target 0.5 kg loss per week
    maintain: 0,
    gain: 0.25, // Target 0.25 kg gain per week
  }[targetTrend];

  const dailyAdjustmentForTarget = (targetWeeklyChange * 7700) / 7;

  // If current trend doesn't match target, apply correction
  let adjustment = dailyAdjustmentForTarget;

  if (targetTrend === 'lose' && weightTrend === 'increasing') {
    // Need more aggressive deficit
    adjustment = dailyAdjustmentForTarget - 200;
  } else if (targetTrend === 'gain' && weightTrend === 'decreasing') {
    // Need more aggressive surplus
    adjustment = dailyAdjustmentForTarget + 200;
  } else if (targetTrend === 'maintain' && weightTrend !== 'stable') {
    // Adjust to stabilize
    adjustment = weightTrend === 'increasing' ? -150 : 150;
  }

  // Factor in actual weight change rate
  if (weightChangePerWeek !== 0) {
    adjustment -= Math.round(weightChangePerWeek * 110); // ~110 cal per 0.1kg/week
  }

  return Math.round(adjustment);
}

/**
 * Generate coaching insight based on data analysis
 */
export interface CoachingInsight {
  type: 'calorie' | 'protein' | 'carbs' | 'fat' | 'weight';
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
  recommendation: string;
  dataPoints: number;
  /** Suggested new target values (optional, for actionable recommendations) */
  suggestedCalories?: number;
  /** Suggested new protein target in grams */
  suggestedProtein?: number;
}

/**
 * Analyze user data and generate coaching insights
 * @param weightData - Array of {timestamp, weight} points
 * @param intakeData - Array of {timestamp, calories, protein, carbs, fat} points
 * @param targets - User's current targets
 * @returns Array of coaching insights
 */
export function generateCoachingInsights(
  weightData: Array<{ timestamp: number; weight: number }>,
  intakeData: Array<{
    timestamp: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }>,
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    weightGoal: 'lose' | 'maintain' | 'gain';
  }
): CoachingInsight[] {
  const insights: CoachingInsight[] = [];

  // Need at least 3 data points for meaningful analysis
  if (weightData.length < 3 || intakeData.length < 3) {
    return insights;
  }

  // Sort by timestamp
  weightData.sort((a, b) => a.timestamp - b.timestamp);
  intakeData.sort((a, b) => a.timestamp - b.timestamp);

  // Convert to days since first entry for regression
  const firstTimestamp = Math.min(
    weightData[0].timestamp,
    intakeData[0].timestamp
  );

  const weightPoints: DataPoint[] = weightData.map((d) => ({
    x: (d.timestamp - firstTimestamp) / (1000 * 60 * 60 * 24), // Days
    y: d.weight,
  }));

  const caloriePoints: DataPoint[] = intakeData.map((d) => ({
    x: (d.timestamp - firstTimestamp) / (1000 * 60 * 60 * 24),
    y: d.calories,
  }));

  // Analyze weight trend
  const weightRegression = linearRegression(weightPoints);
  const weightTrend = detectTrend(weightRegression, 0.05);

  // Calculate weekly weight change
  const weeklyWeightChange = weightRegression.slope * 7;

  // Weight insight
  insights.push({
    type: 'weight',
    trend: weightTrend,
    confidence: Math.abs(weightRegression.correlation),
    recommendation: generateWeightRecommendation(
      weightTrend,
      targets.weightGoal,
      weeklyWeightChange
    ),
    dataPoints: weightData.length,
  });

  // Analyze calorie intake
  const calorieRegression = linearRegression(caloriePoints);
  const calorieTrend = detectTrend(calorieRegression, 50);
  const avgCalories =
    intakeData.reduce((sum, d) => sum + d.calories, 0) / intakeData.length;

  const calorieAdjustment = calculateCalorieAdjustment(
    avgCalories,
    weightTrend,
    targets.weightGoal,
    weeklyWeightChange
  );

  const suggestedCalorieTarget = Math.round(avgCalories + calorieAdjustment);

  insights.push({
    type: 'calorie',
    trend: calorieTrend,
    confidence: Math.abs(calorieRegression.correlation),
    recommendation: generateCalorieRecommendation(
      avgCalories,
      targets.calories,
      calorieAdjustment,
      weightTrend,
      targets.weightGoal
    ),
    dataPoints: intakeData.length,
    suggestedCalories: suggestedCalorieTarget !== targets.calories ? suggestedCalorieTarget : undefined,
  });

  // Analyze protein intake
  const avgProtein =
    intakeData.reduce((sum, d) => sum + d.protein, 0) / intakeData.length;
  const proteinPercentage = (avgProtein / targets.protein) * 100;

  // Calculate suggested protein target based on body weight and goals
  // General guideline: 1.6-2.2g per kg for active individuals
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].weight : 70;
  const suggestedProteinTarget = Math.round(currentWeight * 1.8); // 1.8g per kg as middle ground

  insights.push({
    type: 'protein',
    trend: proteinPercentage >= 90 ? 'stable' : 'decreasing',
    confidence: 0.8,
    recommendation: generateProteinRecommendation(
      avgProtein,
      targets.protein,
      targets.weightGoal
    ),
    dataPoints: intakeData.length,
    suggestedProtein: Math.abs(suggestedProteinTarget - targets.protein) > 10 ? suggestedProteinTarget : undefined,
  });

  return insights;
}

/**
 * Generate weight-specific recommendation
 */
function generateWeightRecommendation(
  trend: 'increasing' | 'decreasing' | 'stable',
  goal: 'lose' | 'maintain' | 'gain',
  weeklyChange: number
): string {
  const trendText =
    trend === 'increasing'
      ? 'gaining'
      : trend === 'decreasing'
        ? 'losing'
        : 'maintaining';

  if (trend === 'stable' && goal === 'maintain') {
    return "Your weight is stable. Great job maintaining your current habits!";
  }

  if (
    (goal === 'lose' && trend === 'decreasing') ||
    (goal === 'gain' && trend === 'increasing') ||
    (goal === 'maintain' && trend === 'stable')
  ) {
    return `You're ${trendText} weight as expected. Keep up the good work! (${weeklyChange.toFixed(2)} kg/week)`;
  }

  if (goal === 'lose' && trend === 'increasing') {
    return `You're gaining weight while trying to lose. Consider reducing daily calories by 200-300 and increasing activity.`;
  }

  if (goal === 'gain' && trend === 'decreasing') {
    return `You're losing weight while trying to gain. Increase daily calories by 300-500 and focus on strength training.`;
  }

  if (goal === 'maintain' && trend !== 'stable') {
    return trend === 'increasing'
      ? 'Slight weight gain detected. Monitor portions and activity levels.'
      : 'Slight weight loss detected. Ensure you\'re eating enough to maintain.';
  }

  return 'Continue monitoring your progress and adjust as needed.';
}

/**
 * Generate calorie-specific recommendation
 */
function generateCalorieRecommendation(
  avgCalories: number,
  target: number,
  adjustment: number,
  weightTrend: 'increasing' | 'decreasing' | 'stable',
  goal: 'lose' | 'maintain' | 'gain'
): string {
  const diff = avgCalories - target;
  const percentage = ((avgCalories / target) * 100).toFixed(0);

  if (Math.abs(diff) < 100) {
    return `You're averaging ${Math.round(avgCalories)} cal/day, close to your target. ${weightTrend === 'stable' ? 'Keep it up!' : 'Monitor your progress.'}`;
  }

  if (goal === 'lose') {
    if (avgCalories > target) {
      return `You're averaging ${percentage}% of your target calories. To lose weight, aim for ${target} cal/day (currently ${Math.round(avgCalories - target)} cal over).`;
    }
    return `Good calorie control! Consider ${adjustment > 0 ? 'increasing' : 'deasing'} by ${Math.abs(adjustment)} cal/day based on your progress.`;
  }

  if (goal === 'gain') {
    if (avgCalories < target) {
      return `You're averaging ${percentage}% of your target calories. To gain weight, aim for ${target} cal/day (currently ${Math.round(target - avgCalories)} cal under).`;
    }
    return `Good calorie intake! Consider ${adjustment > 0 ? 'increasing' : 'decreasing'} by ${Math.abs(adjustment)} cal/day based on your progress.`;
  }

  return `Adjust to ${target + adjustment} cal/day for better weight maintenance.`;
}

/**
 * Generate protein-specific recommendation
 */
function generateProteinRecommendation(
  avgProtein: number,
  target: number,
  goal: 'lose' | 'maintain' | 'gain'
): string {
  const percentage = ((avgProtein / target) * 100).toFixed(0);

  if (avgProtein >= target * 0.9) {
    return `Great protein intake! Averaging ${Math.round(avgProtein)}g/day (${percentage}% of target).`;
  }

  if (avgProtein >= target * 0.7) {
    return `You're at ${percentage}% of your protein target. Try to increase by ${Math.round(target - avgProtein)}g/day for better results.`;
  }

  const recommendedProtein =
    goal === 'lose'
      ? 'higher protein helps preserve muscle during weight loss'
      : goal === 'gain'
        ? 'adequate protein is essential for muscle growth'
        : 'protein helps maintain muscle mass';

  return `Low protein intake (${percentage}% of target). Aim for ${target}g/day - ${recommendedProtein}.`;
}
