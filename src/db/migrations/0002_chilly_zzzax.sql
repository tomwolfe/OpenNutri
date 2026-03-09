CREATE TABLE "shared_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"shared_vault_id" uuid,
	"recipient_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shared_vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"encrypted_vault_key" text NOT NULL,
	"public_key" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"active" boolean DEFAULT true NOT NULL,
	"last_accessed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"encrypted_data" text NOT NULL,
	"encryption_iv" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "yjs_data" text;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "recovery_key_salt" text;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "encrypted_recovery_key" text;--> statement-breakpoint
ALTER TABLE "user_keys" ADD COLUMN "recovery_key_iv" text;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "high_sodium" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "high_carbs" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "yjs_data" text;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_targets" ADD COLUMN "device_id" text;--> statement-breakpoint
ALTER TABLE "shared_logs" ADD CONSTRAINT "shared_logs_log_id_food_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."food_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_logs" ADD CONSTRAINT "shared_logs_shared_vault_id_shared_vaults_id_fk" FOREIGN KEY ("shared_vault_id") REFERENCES "public"."shared_vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_vaults" ADD CONSTRAINT "shared_vaults_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipes" ADD CONSTRAINT "user_recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_recipes_user_id_idx" ON "user_recipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_recipes_updated_at_idx" ON "user_recipes" USING btree ("updated_at");