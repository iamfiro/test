CREATE TABLE "room_creations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_tags" (
	"room_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "room_tags_room_id_tag_id_pk" PRIMARY KEY("room_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "study_room_invites" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_room_members" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_room_members_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "study_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"map" text NOT NULL,
	"capacity" integer NOT NULL,
	"password_ciphertext" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_rooms_capacity_range" CHECK ("study_rooms"."capacity" between 2 and 50)
);
--> statement-breakpoint
ALTER TABLE "room_tags" ADD CONSTRAINT "room_tags_room_id_study_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."study_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_tags" ADD CONSTRAINT "room_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_room_invites" ADD CONSTRAINT "study_room_invites_room_id_study_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."study_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_room_members" ADD CONSTRAINT "study_room_members_room_id_study_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."study_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_room_members" ADD CONSTRAINT "study_room_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_rooms" ADD CONSTRAINT "study_rooms_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_creations_ip_created_idx" ON "room_creations" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "room_tags_tag_idx" ON "room_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_room_invites_token_hash_key" ON "study_room_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "study_room_members_one_room_per_user" ON "study_room_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_rooms_created_idx" ON "study_rooms" USING btree ("created_at");