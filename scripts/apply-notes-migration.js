/**
 * Apply the notes column migration
 * Run with: node scripts/apply-migration.js
 */

const { neon } = require('@neondatabase/serverless');

async function applyMigration() {
  const sql = neon(process.env.DATABASE_URL);

  try {
    console.log('Applying migration: Add notes column to food_logs...');

    // Check if column already exists
    const checkResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'food_logs' AND column_name = 'notes'
    `;

    if (checkResult.length > 0) {
      console.log('Column "notes" already exists. Skipping migration.');
      return;
    }

    // Add the notes column
    await sql`ALTER TABLE "food_logs" ADD COLUMN "notes" text`;

    console.log('✓ Migration applied successfully: Added "notes" column to food_logs');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
