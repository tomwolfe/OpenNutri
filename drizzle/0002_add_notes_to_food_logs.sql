-- Migration: Add notes column to food_logs for AI explanations
-- Allows storing AI-generated notes like "Visible oil sheen suggests higher fat content"

-- Add notes column to food_logs table
ALTER TABLE "food_logs" ADD COLUMN "notes" text;
