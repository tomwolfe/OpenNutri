/**
 * Manual migration script for ai_usage table
 * Run with: node scripts/migrate-ai-usage.js
 */

require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');

async function migrate() {
  const db = neon(process.env.DATABASE_URL);

  console.log('Applying ai_usage table migration...');

  try {
    // Create ai_usage table
    await db.query(`
      CREATE TABLE IF NOT EXISTS "ai_usage" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "timestamp" timestamp with time zone DEFAULT now()
      )
    `);

    // Create indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS "ai_usage_user_id_idx" ON "ai_usage" ("user_id")
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS "ai_usage_timestamp_idx" ON "ai_usage" ("timestamp")
    `);

    // Drop unused NextAuth tables
    await db.query(`DROP TABLE IF EXISTS "accounts" CASCADE`);
    await db.query(`DROP TABLE IF EXISTS "sessions" CASCADE`);
    await db.query(`DROP TABLE IF EXISTS "verification_tokens" CASCADE`);

    console.log('✓ Migration completed successfully!');
    console.log('  - Created ai_usage table');
    console.log('  - Created indexes on user_id and timestamp');
    console.log('  - Dropped unused accounts, sessions, verification_tokens tables');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

migrate();
