-- Migration: Fix database desync and clean up old architecture
-- Addresses:
--   1. Add composite primary key to user_targets (fixes weight tracker crash)
--   2. Remove dead ai_jobs table and job_id column from food_logs

-- 1. Fix the crashing Weight Tracker (Allows onConflictDoUpdate to work)
-- The composite PK on (user_id, date) is required for upserts
ALTER TABLE "user_targets" ADD CONSTRAINT "user_targets_pk" PRIMARY KEY ("user_id", "date");

-- 2. Clean up the old polling architecture properly
-- Remove foreign key constraint first
ALTER TABLE "food_logs" DROP CONSTRAINT IF EXISTS "food_logs_job_id_ai_jobs_id_fk";

-- Remove the job_id column (no longer needed with streaming architecture)
ALTER TABLE "food_logs" DROP COLUMN IF EXISTS "job_id";

-- Drop the index on job_id if it exists
DROP INDEX IF EXISTS "food_logs_job_id_idx";

-- Drop the old ai_jobs table (replaced by streaming + ai_usage tracking)
DROP TABLE IF EXISTS "ai_jobs" CASCADE;
