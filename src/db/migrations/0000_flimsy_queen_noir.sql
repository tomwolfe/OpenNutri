CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"image_url" text,
	"image_hash" text,
	"cached_analysis" text,
	"status" text DEFAULT 'pending',
	"retry_count" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now(),
	"meal_type" text,
	"total_calories" integer,
	"ai_confidence_score" double precision,
	"is_verified" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "log_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"food_name" text,
	"calories" integer,
	"protein" double precision,
	"carbs" double precision,
	"fat" double precision,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_targets" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"calorie_target" integer,
	"protein_target" integer,
	"carb_target" integer,
	"fat_target" integer,
	"weight_record" double precision
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"subscription_tier" text DEFAULT 'free',
	"weight_goal" text DEFAULT 'maintain',
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_items" ADD CONSTRAINT "log_items_log_id_food_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."food_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_targets" ADD CONSTRAINT "user_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_user_id_idx" ON "ai_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_jobs_image_hash_idx" ON "ai_jobs" USING btree ("image_hash");--> statement-breakpoint
CREATE INDEX "ai_jobs_created_at_idx" ON "ai_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "food_logs_user_id_idx" ON "food_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "food_logs_timestamp_idx" ON "food_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "food_logs_job_id_idx" ON "food_logs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "log_items_log_id_idx" ON "log_items" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "log_items_food_name_idx" ON "log_items" USING btree ("food_name");