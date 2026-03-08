/**
 * Setup pgvector extension and seed initial data
 * 
 * Run this once to enable semantic matching:
 * npx tsx scripts/setup-pgvector.ts
 */

import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function setupPgvector() {
  console.log('Setting up pgvector extension...');

  try {
    // Enable pgvector extension
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    console.log('✓ pgvector extension enabled');

    // Verify extension is available
    const result = await db.execute(sql`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `);
    
    if (result.rowCount === 0) {
      console.error('✗ Failed to enable pgvector extension');
      console.error('Your NeonDB instance may not support pgvector.');
      console.error('Visit https://neon.tech/docs/extensions/pgvector to enable it.');
      process.exit(1);
    }

    console.log('✓ pgvector is available');

    // Check if HNSW index support is available
    try {
      await db.execute(sql`
        SELECT * FROM pg_available_extension_versions WHERE name = 'vector'
      `);
      console.log('✓ HNSW index support verified');
    } catch (_error) {
      console.warn('⚠ HNSW index may not be available, using fallback');
    }

    console.log('\n✅ pgvector setup complete!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run db:push (to create usda_cache table)');
    console.log('2. The system will automatically populate embeddings as foods are matched');
    
  } catch (error) {
    console.error('✗ Error setting up pgvector:', error);
    process.exit(1);
  }
}

// Run setup
setupPgvector();
