-- Custom migration: Add ai_usage table for tracking AI API executions
-- This closes the rate limit loophole by counting API calls instead of saved logs

CREATE TABLE IF NOT EXISTS "ai_usage" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "timestamp" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ai_usage_user_id_idx" ON "ai_usage" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_usage_timestamp_idx" ON "ai_usage" ("timestamp");

-- Drop unused NextAuth tables (you're using Credentials provider with JWT)
DROP TABLE IF EXISTS "accounts" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "verification_tokens" CASCADE;
