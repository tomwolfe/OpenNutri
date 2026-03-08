-- Add weightGoal column to users table
-- Created: 2026-03-07
-- Description: Add user weight goal preference for personalized coaching

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS weight_goal text DEFAULT 'maintain';

-- Add comment for documentation
COMMENT ON COLUMN users.weight_goal IS 'User weight goal: lose, maintain, or gain';
