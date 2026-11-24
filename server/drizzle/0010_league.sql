CREATE TABLE "league_group_members" (
	"week_start" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"score_seconds" integer NOT NULL,
	"last_scored_at" timestamp (3) with time zone,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_group_members_week_start_user_id_pk" PRIMARY KEY("week_start","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"league" text NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_groups_member_count_range" CHECK ("league_groups"."member_count" between 0 and 30)
);
--> statement-breakpoint
CREATE TABLE "league_memberships" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"league" text NOT NULL,
	"since_week" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_results" (
	"week_start" timestamp with time zone NOT NULL,
	"user_id" uuid NOT NULL,
	"league" text NOT NULL,
	"group_id" uuid,
	"rank" integer,
	"group_size" integer,
	"score_seconds" integer NOT NULL,
	"outcome" text NOT NULL,
	"next_league" text NOT NULL,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_results_week_start_user_id_pk" PRIMARY KEY("week_start","user_id")
);
--> statement-breakpoint
CREATE TABLE "league_weeks" (
	"week_start" timestamp with time zone PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "league_group_members" ADD CONSTRAINT "league_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_group_members" ADD CONSTRAINT "league_group_members_group_id_league_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."league_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_groups" ADD CONSTRAINT "league_groups_week_start_league_weeks_week_start_fk" FOREIGN KEY ("week_start") REFERENCES "public"."league_weeks"("week_start") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_memberships" ADD CONSTRAINT "league_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_results" ADD CONSTRAINT "league_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_results" ADD CONSTRAINT "league_results_group_id_league_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."league_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_group_members_group_score_idx" ON "league_group_members" USING btree ("group_id","score_seconds" DESC NULLS LAST,"last_scored_at");--> statement-breakpoint
CREATE INDEX "league_group_members_user_idx" ON "league_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "league_groups_week_league_idx" ON "league_groups" USING btree ("week_start","league","created_at");--> statement-breakpoint
CREATE INDEX "league_results_user_week_idx" ON "league_results" USING btree ("user_id","week_start");