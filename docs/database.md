# This Document houses the schema for the database table
Changes to the database schema should never be done without explicit permission. If any changes are needed, a clear and concise explanation should be given as to why, along with a detailed explanation of the proposed changes.

CREATE SCHEMA "public";
CREATE TYPE "tournament_status" AS ENUM('Not Started', 'Ongoing', 'Finished');
CREATE TYPE "fixture_status" AS ENUM('UPCOMING', 'CANCELLED', 'COMPLETED', 'LIVE');
CREATE TABLE "divisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tournament_id" uuid NOT NULL,
	"name" text NOT NULL,
	"num_teams" integer DEFAULT 0,
	"type" varchar(50),
	"state" jsonb,
	"last_update" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY,
	"division_id" uuid NOT NULL,
	"match_no" integer NOT NULL,
	"team_1" uuid,
	"team_2" uuid,
	"status" fixture_status DEFAULT 'UPCOMING',
	"team_1_result" integer[],
	"team_2_result" integer[],
	"round" text,
	"team_1_placeholder" text,
	"team_2_placeholder" text
);
CREATE TABLE "saved_tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"tournament_id" uuid NOT NULL
);
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"user_id" uuid NOT NULL
);
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"location" varchar(50) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"status" tournament_status DEFAULT 'Not Started'
);
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" varchar(100) NOT NULL CONSTRAINT "users_username_key" UNIQUE,
	"email" varchar(100) NOT NULL CONSTRAINT "users_email_key" UNIQUE,
	"password" text NOT NULL,
	"admin" boolean DEFAULT false
);
CREATE UNIQUE INDEX "divisions_pkey" ON "divisions" ("id");
CREATE UNIQUE INDEX "fixtures_pkey" ON "fixtures" ("id");
CREATE UNIQUE INDEX "saved_tournaments_pkey" ON "saved_tournaments" ("id");
CREATE UNIQUE INDEX "teams_pkey" ON "teams" ("id");
CREATE UNIQUE INDEX "tournaments_pkey" ON "tournaments" ("id");
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE UNIQUE INDEX "users_pkey" ON "users" ("id");
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");
ALTER TABLE "divisions" ADD CONSTRAINT "tournament_division_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixtures" ADD CONSTRAINT "division_fixture_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixtures" ADD CONSTRAINT "team1_fixture_fkey" FOREIGN KEY ("team_1") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fixtures" ADD CONSTRAINT "team2_fixture_fkey" FOREIGN KEY ("team_2") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_tournaments" ADD CONSTRAINT "tournaments_saved_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_tournaments" ADD CONSTRAINT "users_saved_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teams" ADD CONSTRAINT "user_teams_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournament_owner" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE CASCADE;