/**
 * Verify migration results
 */

import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

async function verifyMigration() {
  console.log('Verifying migration results...\n');

  // Check user_targets primary key
  console.log('1. Checking user_targets primary key...');
  const pkResult = (await sql.query(`
    SELECT constraint_name, constraint_type 
    FROM information_schema.table_constraints 
    WHERE table_name = 'user_targets' AND constraint_type = 'PRIMARY KEY';
  `)) as unknown as Record<string, unknown>[];
  console.log('   Primary key constraint:', pkResult);

  // Check food_logs columns
  console.log('\n2. Checking food_logs columns (job_id should be removed)...');
  const columnsResult = (await sql.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'food_logs' 
    ORDER BY ordinal_position;
  `)) as unknown as Record<string, unknown>[];
  const columns = Array.isArray(columnsResult) ? columnsResult : (columnsResult as { rows?: Record<string, unknown>[] })?.rows || [];
  console.log('   Columns:', columns.map((r: Record<string, unknown>) => r.column_name));

  // Check if ai_jobs table exists
  console.log('\n3. Checking if ai_jobs table exists (should be dropped)...');
  const tableExists = (await sql.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_name = 'ai_jobs';
  `)) as unknown as Record<string, unknown>[];
  const tables = Array.isArray(tableExists) ? tableExists : (tableExists as { rows?: Record<string, unknown>[] })?.rows || [];
  console.log('   ai_jobs table:', tables.length > 0 ? 'EXISTS (should be dropped)' : 'DROPPED ✓');

  console.log('\n✓ Verification complete!');
}

verifyMigration().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
