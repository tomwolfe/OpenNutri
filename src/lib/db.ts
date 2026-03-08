/**
 * NeonDB Serverless Connection with Drizzle ORM
 * 
 * Important for Vercel Serverless:
 * - Uses neon/serverless driver for connection pooling
 * - Avoids connection exhaustion in serverless environments
 * - Single shared connection per cold start
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

// Create serverless client with proper pooling configuration
const sql = neon(process.env.DATABASE_URL!);

// Export the drizzle instance with schema
export const db = drizzle(sql, { schema });

// Export sql for raw queries if needed
export { sql };
