CREATE TABLE "chat_blocks" (
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_blocks_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_blocks" ADD CONSTRAINT "chat_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_blocks_blocked_user_idx" ON "chat_blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_author_client_key" ON "chat_messages" USING btree ("author_user_id","client_id");--> statement-breakpoint
CREATE INDEX "chat_messages_topic_created_idx" ON "chat_messages" USING btree ("topic","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "chat_messages" USING btree ("created_at");