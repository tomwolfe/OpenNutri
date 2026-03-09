/**
 * NeonDB Serverless Connection with Drizzle ORM
 *
 * Important for Vercel Serverless:
 * - Uses neon-serverless driver for transaction support
 * - Avoids connection exhaustion in serverless environments
 * - Single shared connection per cold start
 */

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@/db/schema';

// Create serverless connection pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// Export the drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export pool for raw queries if needed
export { pool };
