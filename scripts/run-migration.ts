/**
 * Run custom SQL migration directly against NeonDB
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.DATABASE_URL!);

async function runMigration() {
  console.log('Running database migration...\n');

  const migrationSql = readFileSync(
    resolve(process.cwd(), 'drizzle/0001_fix_database_desync.sql'),
    'utf-8'
  );

  // Remove comments and split by semicolons
  const statements = migrationSql
    .split('\n')
    .filter(line => !line.trim().startsWith('--')) // Remove comment lines
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      console.log('Executing:', statement.split('\n')[0].trim().substring(0, 60));
      await sql.query(statement, []);
      console.log('✓ Success\n');
    } catch (error: unknown) {
      const err = error as { code?: string; message: string };
      // Ignore "already exists" errors for idempotent migrations
      if (err.code === '42P07' || err.message.includes('already exists')) {
        console.log('⚠ Skipped (already exists)\n');
      } else if (err.code === '42701' || err.message.includes('duplicate')) {
        console.log('⚠ Skipped (duplicate constraint)\n');
      } else if (err.code === '42704' || err.message.includes('does not exist')) {
        console.log('⚠ Skipped (constraint/index does not exist)\n');
      } else if (err.code === '42P16' || err.message.includes('multiple primary keys')) {
        console.log('⚠ Skipped (primary key already exists)\n');
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('✗ Error:', errorMessage);
        throw error;
      }
    }
  }

  console.log('\n✓ Migration completed successfully!');
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
