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
 * @returns TDEE result with BMR and calorie targets
 */
export function calculateTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: Gender,
  activityLevel: ActivityLevel
): TDEEResult {
  const bmr = calculateBMR(weightKg, heightCm, age, gender);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const tdee = Math.round(bmr * multiplier);
  
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
