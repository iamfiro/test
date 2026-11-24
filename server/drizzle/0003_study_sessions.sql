CREATE TABLE "presence_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ranked_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone NOT NULL,
	"study_date" date NOT NULL,
	"timezone" text NOT NULL,
	CONSTRAINT "ranked_segments_positive" CHECK ("ranked_segments"."ended_at" > "ranked_segments"."started_at")
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text NOT NULL,
	"subject" text,
	"timezone" text NOT NULL,
	"segments" jsonb NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"focused_seconds" integer,
	"study_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "presence_spans" ADD CONSTRAINT "presence_spans_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence_spans" ADD CONSTRAINT "presence_spans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_segments" ADD CONSTRAINT "ranked_segments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranked_segments" ADD CONSTRAINT "ranked_segments_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "presence_spans_session_ended_idx" ON "presence_spans" USING btree ("session_id","ended_at");--> statement-breakpoint
CREATE INDEX "ranked_segments_user_started_idx" ON "ranked_segments" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "ranked_segments_user_study_date_idx" ON "ranked_segments" USING btree ("user_id","study_date");--> statement-breakpoint
CREATE INDEX "ranked_segments_session_idx" ON "ranked_segments" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_sessions_one_active_per_user" ON "study_sessions" USING btree ("user_id") WHERE "study_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "study_sessions_user_study_date_idx" ON "study_sessions" USING btree ("user_id","study_date");--> statement-breakpoint
CREATE INDEX "study_sessions_user_ended_at_idx" ON "study_sessions" USING btree ("user_id","ended_at");