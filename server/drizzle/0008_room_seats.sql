ALTER TABLE "study_room_members" ADD COLUMN "seat" integer;--> statement-breakpoint
-- 이미 있는 멤버는 방마다 방장 먼저·들어온 순으로 0번부터 앉힌다(손으로 넣은 줄: drizzle-kit은 NOT NULL을 바로 붙여 기존 행에서 실패한다).
UPDATE "study_room_members" m SET "seat" = r.n FROM (
	SELECT sm."room_id", sm."user_id", (row_number() OVER (PARTITION BY sm."room_id" ORDER BY (sm."user_id" = sr."host_user_id") DESC, sm."joined_at", sm."user_id") - 1)::int AS n
	FROM "study_room_members" sm JOIN "study_rooms" sr ON sr."id" = sm."room_id"
) r WHERE m."room_id" = r."room_id" AND m."user_id" = r."user_id";--> statement-breakpoint
ALTER TABLE "study_room_members" ALTER COLUMN "seat" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "study_room_members_room_seat" ON "study_room_members" USING btree ("room_id","seat");--> statement-breakpoint
ALTER TABLE "study_room_members" ADD CONSTRAINT "study_room_members_seat_nonnegative" CHECK ("study_room_members"."seat" >= 0);