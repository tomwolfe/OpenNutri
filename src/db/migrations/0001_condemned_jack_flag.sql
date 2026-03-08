CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usda_cache" (
	"fdc_id" integer PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"data_type" text,
	"embedding" vector(1024),
	"calories" double precision,
	"protein" double precision,
	"carbs" double precision,
	"fat" double precision,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_accessed" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_keys" (
	"user_id" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"encrypted_vault_key" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_rotated" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_jobs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification_tokens" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "accounts" CASCADE;--> statement-breakpoint
DROP TABLE "ai_jobs" CASCADE;--> statement-breakpoint
DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TABLE "verification_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "food_logs" DROP CONSTRAINT "food_logs_job_id_ai_jobs_id_fk";
--> statement-breakpoint
DROP INDEX "food_logs_job_id_idx";--> statement-breakpoint
ALTER TABLE "user_targets" ADD CONSTRAINT "user_targets_user_id_date_pk" PRIMARY KEY("user_id","date");--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "encrypted_data" text NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "encryption_iv" text NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "encryption_salt" text;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "activity_level" text;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keys" ADD CONSTRAINT "user_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_timestamp_idx" ON "ai_usage" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ai_usage_user_id_timestamp_idx" ON "ai_usage" USING btree ("user_id","timestamp");--> statement-breakpoint
CREATE INDEX "usda_cache_embedding_idx" ON "usda_cache" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "usda_cache_description_idx" ON "usda_cache" USING btree ("description");--> statement-breakpoint
CREATE INDEX "usda_cache_last_accessed_idx" ON "usda_cache" USING btree ("last_accessed");--> statement-breakpoint
CREATE INDEX "food_logs_updated_at_idx" ON "food_logs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "user_targets_date_idx" ON "user_targets" USING btree ("date");--> statement-breakpoint
CREATE INDEX "user_targets_updated_at_idx" ON "user_targets" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "food_logs" DROP COLUMN "job_id";