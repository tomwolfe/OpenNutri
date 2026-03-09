/**
 * TDEE (Total Daily Energy Expenditure) Calculator
 *
 * Uses the Mifflin-St Jeor Equation (most accurate for general population).
 * 
 * BMR Formulas:
 * - Men: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) + 5
 * - Women: (10 × weight in kg) + (6.25 × height in cm) - (5 × age in years) - 161
 * 
 * TDEE = BMR × Activity Multiplier
 */

export type Gender = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

interface TDEEResult {
  bmr: number;
  tdee: number;
  calorieTargets: {
    lose: number;
    maintain: number;
    gain: number;
  };
}

/**
 * Activity level multipliers based on Harris-Benedict scale
 */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,      // Little or no exercise
  light: 1.375,        // Light exercise 1-3 days/week
  moderate: 1.55,      // Moderate exercise 3-5 days/week
  active: 1.725,       // Hard exercise 6-7 days/week
  very_active: 1.9,    // Very hard exercise & physical job
};

/**
 * Calculate age from birth date
 */
export function calculateAge(birthDate: string | Date): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Calculate BMR using Mifflin-St Jeor Equation
 */
export function calculateBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender
): number {
  let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
  
  if (gender === 'male') {
    bmr += 5;
  } else if (gender === 'female') {
    bmr -= 161;
  }
  // 'other' uses male formula as baseline
  
  return Math.round(bmr);
}

/**
 * Calculate TDEE and calorie targets
 * 
 * @param weightKg - Current weight in kilograms
 * @param heightCm - Height in centimeters
 * @param age - Age in years
 * @param gender - Gender (male/female/other)
 * @param activityLevel - Activity level
 * @param activeCaloriesBurned - Optional empirical data from Health API
 * @returns TDEE result with BMR and calorie targets
 */
export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel,
  activeCaloriesBurned?: number
): TDEEResult {
  const bmr = calculateBMR(weightKg, heightCm, age, gender);
  
  // Use empirical active energy if available, otherwise fallback to multiplier
  const tdee = activeCaloriesBurned !== undefined
    ? Math.round(bmr + activeCaloriesBurned)
    : Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
  
  // Calorie targets based on goals
  return {
    bmr,
    tdee,
    calorieTargets: {
      lose: tdee - 500,      // 0.5kg loss per week
      maintain: tdee,
      gain: tdee + 500,      // 0.5kg gain per week
    },
  };
}

/**
 * Calculate TDEE from user profile and latest weight
 * 
 * @param userProfile - User profile with birthDate, gender, heightCm, activityLevel
 * @param latestWeightKg - Latest recorded weight (from user_targets)
 * @returns TDEE result or null if insufficient data
 */
export function calculateTDEEFromProfile(
  userProfile: {
    birthDate: string | null;
    gender: string | null;
    heightCm: number | null;
    activityLevel: string | null;
  },
  latestWeightKg: number
): TDEEResult | null {
  if (
    !userProfile.birthDate ||
    !userProfile.gender ||
    !userProfile.heightCm ||
    !userProfile.activityLevel ||
    !latestWeightKg
  ) {
    return null;
  }
  
  const age = calculateAge(userProfile.birthDate);
  
  return calculateTDEE(
    latestWeightKg,
    userProfile.heightCm,
    age,
    userProfile.gender as Gender,
    userProfile.activityLevel as ActivityLevel
  );
}

/**
 * Get activity level options for UI
 */
export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; description: string }[] = [
  {
    value: 'sedentary',
    label: 'Sedentary',
    description: 'Desk job, little or no exercise',
  },
  {
    value: 'light',
    label: 'Lightly Active',
    description: 'Light exercise 1-3 days/week',
  },
  {
    value: 'moderate',
    label: 'Moderately Active',
    description: 'Moderate exercise 3-5 days/week',
  },
  {
    value: 'active',
    label: 'Very Active',
    description: 'Hard exercise 6-7 days/week',
  },
  {
    value: 'very_active',
    label: 'Extremely Active',
    description: 'Very hard exercise & physical job',
  },
];

/**
 * Get gender options for UI
 */
export const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

/**
 * Task 3.2: Adaptive TDEE - Dynamic calorie adjustment based on activity
 * 
 * Adjusts daily calorie target based on:
 * - Previous day's step count (increases target on active days)
 * - Kalman weight trend (adjusts baseline if trend differs from expected)
 * 
 * @param baseTdee - Base TDEE from calculateTDEE()
 * @param stepsYesterday - Steps from previous day (from Health API)
 * @param kalmanTrendSlope - Weight trend slope from Kalman filter (kg/day)
 * @param weightGoal - User's weight goal
 * @returns Adjusted daily calorie target
 */
export function calculateAdaptiveTDEE(
  baseTdee: number,
  stepsYesterday: number | null,
  kalmanTrendSlope: number | null,
  weightGoal: 'lose' | 'maintain' | 'gain'
): {
  adjustedTdee: number;
  stepAdjustment: number;
  trendAdjustment: number;
  explanation: string;
} {
  const STEP_BASELINE = 8000; // Baseline steps for average day
  const STEP_MULTIPLIER = 0.04; // ~4 kcal per 1000 steps above baseline
  
  // Step-based adjustment
  let stepAdjustment = 0;
  if (stepsYesterday !== null && stepsYesterday > STEP_BASELINE) {
    const extraSteps = stepsYesterday - STEP_BASELINE;
    stepAdjustment = Math.round(extraSteps / 1000 * STEP_MULTIPLIER * 100); // kcal per 1000 steps
  }
  
  // Kalman trend-based adjustment
  let trendAdjustment = 0;
  if (kalmanTrendSlope !== null) {
    // Convert kg/day to weekly change
    const weeklyChange = kalmanTrendSlope * 7;
    
    // If losing/gaining faster than expected, adjust
    const expectedWeeklyChange = {
      lose: -0.5,    // Target 0.5kg loss/week
      maintain: 0,   // Target stable weight
      gain: 0.25,    // Target 0.25kg gain/week
    }[weightGoal];
    
    const deviation = weeklyChange - expectedWeeklyChange;
    
    // 7700 kcal ≈ 1kg body fat
    // Adjust by 200 kcal if deviation > 0.2kg/week
    if (Math.abs(deviation) > 0.2) {
      trendAdjustment = Math.round(deviation * 7700 / 7 * 0.3); // 30% correction factor
    }
  }
  
  const adjustedTdee = baseTdee + stepAdjustment + trendAdjustment;
  
  // Build explanation
  const explanations: string[] = [];
  if (stepAdjustment > 50) {
    explanations.push(`+${stepAdjustment} kcal for ${stepsYesterday} steps yesterday`);
  } else if (stepAdjustment < -50) {
    explanations.push(`${stepAdjustment} kcal for low activity`);
  }
  
  if (trendAdjustment !== 0) {
    const sign = trendAdjustment > 0 ? '+' : '';
    explanations.push(`${sign}${trendAdjustment} kcal based on weight trend`);
  }
  
  const explanation = explanations.length > 0 
    ? `Adjusted: ${explanations.join(', ')}`
    : 'No adjustment needed';
  
  return {
    adjustedTdee: Math.round(adjustedTdee),
    stepAdjustment,
    trendAdjustment,
    explanation,
  };
}

/**
 * Calculate actual TDEE based on weight change over time
 *
 * Uses the formula: Real TDEE = Avg Calories - (Weight Change in kg * 7700 / days)
 * Where 7700 kcal ≈ 1 kg of body fat
 *
 * @param avgCalories - Average daily calorie intake over the period
 * @param weightChangeKg - Net weight change in kg (positive = gain, negative = loss)
 * @param days - Number of days in the observation period
 * @returns Estimated actual TDEE, or null if insufficient data
 */
export function calculateActualTDEE(
  avgCalories: number,
  weightChangeKg: number,
  days: number
): number | null {
  if (days < 7 || avgCalories <= 0) {
    return null; // Need at least 1 week of data
  }

  // Calculate the calorie equivalent of weight change
  // Positive weight change = surplus, negative = deficit
  const calorieWeightOfChange = (weightChangeKg * 7700) / days;

  // Actual TDEE = Average calories - (weight change impact per day)
  // If gaining weight: TDEE is lower than intake
  // If losing weight: TDEE is higher than intake
  const actualTdee = avgCalories - calorieWeightOfChange;

  // Sanity check: TDEE should be between 800 and 5000 for most humans
  if (actualTdee < 800 || actualTdee > 5000) {
    return null; // Likely inaccurate data
  }

  return Math.round(actualTdee);
}

/**
 * Compare calculated TDEE with profile TDEE and determine if adjustment is needed
 *
 * @param actualTdee - TDEE calculated from actual weight changes
 * @param profileTdee - TDEE from user profile (Mifflin-St Jeor estimate)
 * @returns Object with recommendation and adjustment details
 */
export function compareTDEEWithProfile(
  actualTdee: number,
  profileTdee: number
): {
  shouldAdjust: boolean;
  difference: number;
  percentageDifference: number;
  recommendation: 'increase' | 'decrease' | 'maintain';
} {
  const difference = actualTdee - profileTdee;
  const percentageDifference = (difference / profileTdee) * 100;

  // Only recommend adjustment if difference is >10%
  const shouldAdjust = Math.abs(percentageDifference) > 10;

  let recommendation: 'increase' | 'decrease' | 'maintain' = 'maintain';
  if (shouldAdjust) {
    recommendation = difference > 0 ? 'increase' : 'decrease';
  }

  return {
    shouldAdjust,
    difference: Math.round(difference),
    percentageDifference: Math.round(percentageDifference * 10) / 10,
    recommendation,
  };
}
