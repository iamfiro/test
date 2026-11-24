CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_restrictions" (
	"ip" text NOT NULL,
	"kind" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ip_restrictions_ip_kind_pk" PRIMARY KEY("ip","kind")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp (3) with time zone,
	"action" text
);
--> statement-breakpoint
CREATE TABLE "user_restrictions" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_restrictions_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ip_restrictions_until_idx" ON "ip_restrictions" USING btree ("until");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_one_per_reporter" ON "reports" USING btree ("reporter_user_id","target_type","target_id","content");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "reports_created_idx" ON "reports" USING btree ("created_at");