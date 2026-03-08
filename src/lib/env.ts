/**
 * Environment Variable Validation
 *
 * Validates required and optional environment variables at startup.
 * Helps catch configuration issues early.
 */

const requiredEnvVars = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
] as const;

const optionalEnvVars = [
  'USDA_API_KEY',
  'GLM_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
  'CRON_SECRET',
  'AI_SCAN_LIMIT_FREE',
  'PASSWORD_HASH_SALT_ROUNDS',
] as const;

type RequiredEnvVar = (typeof requiredEnvVars)[number];
type OptionalEnvVar = (typeof optionalEnvVars)[number];

export type Env = {
  [K in RequiredEnvVar]: string;
} & {
  [K in OptionalEnvVar]?: string;
};

/**
 * Validate that all required environment variables are set
 * @throws Error if any required variable is missing
 */
export function validateEnv(): void {
  const missingRequired = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missingRequired.join(', ')}`
    );
  }

  // Log warnings for missing optional variables in development
  if (process.env.NODE_ENV === 'development') {
    const missingOptional = optionalEnvVars.filter(
      (envVar) => !process.env[envVar]
    );

    if (missingOptional.length > 0) {
      console.warn(
        '⚠️  Missing optional environment variable(s):',
        missingOptional.join(', ')
      );
    }
  }
}

/**
 * Get environment variable with type safety
 * @param name - Environment variable name
 * @param required - Whether the variable is required (default: true)
 * @returns The environment variable value
 * @throws Error if required variable is missing
 */
export function getEnv<T extends string = string>(
  name: string,
  required = true
): T | undefined {
  const value = process.env[name];

  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value as T | undefined;
}

/**
 * Get environment variable as integer
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed integer value
 */
export function getEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer`);
  }

  return parsed;
}

/**
 * Get environment variable as boolean
 * @param name - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Parsed boolean value
 */
export function getEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true' || value === '1';
}
