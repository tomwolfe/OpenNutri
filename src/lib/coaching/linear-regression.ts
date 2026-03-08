/**
 * Linear and Multiple Linear Regression for Adaptive Coaching
 *
 * Implements:
 * - Simple linear regression (least squares)
 * - Multiple linear regression for macro impact analysis
 * - Moving average for smoothing trends
 *
 * Used to provide personalized recommendations based on:
 * - Weight vs Calorie Intake
 * - Weight vs Macronutrient ratios
 * - Progress trends over time
 */

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
 * Calculate multiple linear regression using OLS (Ordinary Least Squares)
 * Analyzes the impact of calories, protein %, and carbs % on weight change
 *
 * @param points - Array of data points with calories, protein %, carbs %, and weight change
 * @returns Multiple regression results with coefficients and insights
 */
export function multipleLinearRegression(
  points: MultipleDataPoint[]
): MultipleRegressionResult {
  const n = points.length;

  if (n < 10) {
    // Need more data points for meaningful multiple regression
    return {
      coefficients: {
        calories: 0,
        proteinPercent: 0,
        carbsPercent: 0,
        intercept: 0,
      },
      rSquared: 0,
      adjustedRSquared: 0,
      prediction: () => 0,
      insights: {
        proteinImpact: 'neutral',
        carbsImpact: 'neutral',
        recommendation: 'Insufficient data for macro analysis. Continue logging for at least 10 days.',
      },
    };
  }

  // Calculate means
  const x1Mean = points.reduce((sum, p) => sum + p.x1, 0) / n;
  const x2Mean = points.reduce((sum, p) => sum + p.x2, 0) / n;
  const x3Mean = points.reduce((sum, p) => sum + p.x3, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / n;

  // Calculate covariance matrix and coefficients using normal equations
  // Simplified approach: calculate partial correlations (diagonal approximation)
  let sumX1Y = 0, sumX2Y = 0, sumX3Y = 0;
  let sumX1X1 = 0, sumX2X2 = 0, sumX3X3 = 0;

  for (const point of points) {
    const dx1 = point.x1 - x1Mean;
    const dx2 = point.x2 - x2Mean;
    const dx3 = point.x3 - x3Mean;
    const dy = point.y - yMean;

    sumX1Y += dx1 * dy;
    sumX2Y += dx2 * dy;
    sumX3Y += dx3 * dy;

    sumX1X1 += dx1 * dx1;
    sumX2X2 += dx2 * dx2;
    sumX3X3 += dx3 * dx3;
  }

  // Simplified coefficient estimation (diagonal approximation)
  // In production, use matrix inversion for full OLS
  const b1 = sumX1X1 !== 0 ? sumX1Y / sumX1X1 : 0;
  const b2 = sumX2X2 !== 0 ? sumX2Y / sumX2X2 : 0;
  const b3 = sumX3X3 !== 0 ? sumX3Y / sumX3X3 : 0;

  const intercept = yMean - b1 * x1Mean - b2 * x2Mean - b3 * x3Mean;

  // Calculate R²
  let ssTot = 0;
  let ssRes = 0;

  for (const point of points) {
    const yPred = intercept + b1 * point.x1 + b2 * point.x2 + b3 * point.x3;
    ssTot += Math.pow(point.y - yMean, 2);
    ssRes += Math.pow(point.y - yPred, 2);
  }

  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  const adjustedRSquared = 1 - (1 - rSquared) * (n - 1) / (n - 4); // 4 = 3 predictors + intercept

  // Generate insights based on coefficients
  const proteinImpact = b2 > 0.001 ? 'positive' : b2 < -0.001 ? 'negative' : 'neutral';
  const carbsImpact = b3 > 0.001 ? 'positive' : b3 < -0.001 ? 'negative' : 'neutral';

  // Generate macro-specific recommendation
  let recommendation = '';
  const proteinCoeff = (b2 * 100).toFixed(3);
  const carbsCoeff = (b3 * 100).toFixed(3);

  if (proteinImpact === 'positive') {
    recommendation = `Higher protein intake correlates with better weight loss (${proteinCoeff} kg per 1% increase). Consider increasing protein by 5-10% of total calories.`;
  } else if (proteinImpact === 'negative') {
    recommendation = `Higher protein intake shows unexpected correlation with weight gain. Review protein sources and overall calorie balance.`;
  } else {
    recommendation = `Protein intake shows neutral impact on weight change. Current protein levels are appropriate.`;
  }

  if (carbsImpact === 'positive' && proteinImpact === 'positive') {
    recommendation += ' Both protein and carbs show positive correlations - focus on total calorie control.';
  } else if (carbsImpact === 'negative') {
    recommendation += ` Reducing carbs by 5% may improve results (${carbsCoeff} kg per 1% decrease).`;
  }

  return {
    coefficients: {
      calories: b1,
      proteinPercent: b2,
      carbsPercent: b3,
      intercept,
    },
    rSquared: Math.max(0, rSquared),
    adjustedRSquared: Math.max(0, adjustedRSquared),
    prediction: (calories: number, proteinPercent: number, carbsPercent: number) =>
      intercept + b1 * calories + b2 * proteinPercent + b3 * carbsPercent,
    insights: {
      proteinImpact,
      carbsImpact,
      recommendation,
    },
  };
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
export interface IntakePoint {
  timestamp: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weightGoal: 'lose' | 'maintain' | 'gain';
}

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
 * Uses both simple linear regression for trends and multiple regression for macro analysis
 * @param weightData - Array of {timestamp, weight} points
 * @param intakeData - Array of {timestamp, calories, protein, carbs, fat} points
 * @param targets - User's current targets
 * @returns Array of coaching insights with macro-specific recommendations
 */
export function generateCoachingInsights(
  weightData: Array<{ timestamp: number; weight: number }>,
  intakeData: IntakePoint[],
  targets: MacroTargets
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

  // Multiple Linear Regression: Analyze macro impact on weight change
  // Prepare data points for multiple regression
  const multiPoints: MultipleDataPoint[] = [];
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].weight : 70;

  for (let i = 0; i < intakeData.length; i++) {
    const intake = intakeData[i];
    
    // Find corresponding weight change (use next weight measurement or interpolate)
    const intakeDay = (intake.timestamp - firstTimestamp) / (1000 * 60 * 60 * 24);
    
    // Find weight at intake day and next day to calculate change
    let weightBefore = currentWeight;
    let weightAfter = currentWeight;
    
    for (let j = 0; j < weightData.length - 1; j++) {
      const weightDay = (weightData[j].timestamp - firstTimestamp) / (1000 * 60 * 60 * 24);
      const nextWeightDay = (weightData[j + 1].timestamp - firstTimestamp) / (1000 * 60 * 60 * 24);
      
      if (weightDay <= intakeDay && intakeDay < nextWeightDay) {
        weightBefore = weightData[j].weight;
        weightAfter = weightData[j + 1].weight;
        break;
      }
    }
    
    const weightChange = weightAfter - weightBefore;
    
    // Calculate macro percentages of total calories
    const proteinPercent = intake.calories > 0 ? (intake.protein * 4 / intake.calories) * 100 : 0;
    const carbsPercent = intake.calories > 0 ? (intake.carbs * 4 / intake.calories) * 100 : 0;
    
    multiPoints.push({
      x1: intake.calories,
      x2: proteinPercent,
      x3: carbsPercent,
      y: weightChange,
    });
  }

  // Run multiple regression if we have enough data
  if (multiPoints.length >= 10) {
    const multiRegression = multipleLinearRegression(multiPoints);
    
    // Add macro-specific insight from multiple regression
    if (multiRegression.insights.recommendation) {
      insights.push({
        type: 'protein',
        trend: multiRegression.insights.proteinImpact === 'positive' ? 'stable' : 'decreasing',
        confidence: multiRegression.rSquared,
        recommendation: multiRegression.insights.recommendation,
        dataPoints: multiPoints.length,
        suggestedProtein: multiRegression.insights.proteinImpact === 'positive' 
          ? Math.round(targets.protein * 1.1) // Suggest 10% increase
          : multiRegression.insights.proteinImpact === 'negative'
            ? Math.round(targets.protein * 0.9) // Suggest 10% decrease
            : undefined,
      });
    }
  } else {
    // Fallback to simple protein analysis
    const avgProtein =
      intakeData.reduce((sum, d) => sum + d.protein, 0) / intakeData.length;
    const proteinPercentage = (avgProtein / targets.protein) * 100;

    const suggestedProteinTarget = Math.round(currentWeight * 1.8);

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
  }

  // Proactive Insight: Consistency & Streaks
  const consistencyInsight = generateConsistencyInsight(intakeData);
  if (consistencyInsight) {
    insights.push(consistencyInsight);
  }

  // Proactive Insight: Specific Macro Deficiencies (e.g., Protein)
  const macroDeficiencyInsight = generateMacroDeficiencyInsight(intakeData, targets);
  if (macroDeficiencyInsight) {
    insights.push(macroDeficiencyInsight);
  }

  return insights;
}

/**
 * Generate consistency and streak insights
 */
function generateConsistencyInsight(
  intakeData: IntakePoint[],
): CoachingInsight | null {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  // Calculate logging streak
  let streak = 0;
  const sortedIntake = [...intakeData].sort((a, b) => b.timestamp - a.timestamp);
  
  for (let i = 0; i < sortedIntake.length; i++) {
    const dayDiff = Math.floor((now - sortedIntake[i].timestamp) / oneDay);
    if (dayDiff === streak) {
      streak++;
    } else if (dayDiff > streak) {
      break;
    }
  }

  if (streak >= 3) {
    return {
      type: 'weight', // Use weight as a proxy for general progress
      trend: 'stable',
      confidence: 1,
      recommendation: `You're on a ${streak}-day logging streak! Consistency is the #1 predictor of long-term success. Keep it up!`,
      dataPoints: intakeData.length,
    };
  }

  // Check for missing data
  const lastLoggingDay = sortedIntake.length > 0 ? Math.floor((now - sortedIntake[0].timestamp) / oneDay) : 7;
  if (lastLoggingDay >= 2) {
    return {
      type: 'calorie',
      trend: 'decreasing',
      confidence: 0.9,
      recommendation: `We haven't seen any food logs for ${lastLoggingDay} days. Small, consistent entries are better than perfect ones!`,
      dataPoints: intakeData.length,
    };
  }

  return null;
}

/**
 * Detect specific macro deficiencies over the last few days
 */
function generateMacroDeficiencyInsight(
  intakeData: IntakePoint[],
  targets: MacroTargets
): CoachingInsight | null {
  if (intakeData.length < 3) return null;

  const last3Days = intakeData
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
  
  const avgProtein = last3Days.reduce((sum, d) => sum + d.protein, 0) / 3;
  const proteinTarget = targets.protein;

  if (avgProtein < proteinTarget * 0.7) {
    return {
      type: 'protein',
      trend: 'decreasing',
      confidence: 0.95,
      recommendation: `You've been low on protein for the last 3 days (${Math.round(avgProtein)}g avg vs ${proteinTarget}g target). Muscle recovery might be stalling. Try adding a protein source to your next meal.`,
      dataPoints: 3,
      suggestedProtein: proteinTarget,
    };
  }

  return null;
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
