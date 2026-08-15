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
	"division_id" uuid NOT NULL
);
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"location" varchar(50) NOT NULL,
	"description" text,
	"created_by" uuid NOT NULL,
	"status" tournament_status DEFAULT 'Not Started',
	"schedule" jsonb,
	"last_update" timestamp DEFAULT now() NOT NULL
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
ALTER TABLE "teams" ADD CONSTRAINT "division_teams_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournament_owner" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON UPDATE CASCADE;

CREATE FUNCTION "update_last_updated"() RETURNS trigger AS $$
BEGIN
  IF row(NEW.*) IS DISTINCT FROM row(OLD.*) THEN
    NEW.last_update = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "trg_divisions_last_updated" BEFORE UPDATE ON "divisions" FOR EACH ROW EXECUTE FUNCTION "update_last_updated"();
CREATE TRIGGER "trg_tournaments_last_updated" BEFORE UPDATE ON "tournaments" FOR EACH ROW EXECUTE FUNCTION "update_last_updated"();

## Notes

`trg_divisions_last_updated` stamps `divisions.last_update` on any UPDATE that
actually changes the row, so no query needs to set that column itself.

It went unrecorded here until 2026-08-09, and the function assigned `NEW.last_updated`
— a column that has never existed — so **every** UPDATE to `divisions` failed with
`record "new" has no field "last_updated"`. Nothing noticed because no working code
path updated a division row: creation inserts, and deletion cascades. Round
progression and score entry both would have. The typo was corrected on 2026-08-09.

`trg_tournaments_last_updated` was added on 2026-08-11 and reuses the same function
unchanged. It is what makes `tournamentRepository.updateSchedule` stamp anything at
all — that statement previously moved no timestamp, and the two lifecycle statements
(`startTournament`, `endTournament`) did not either. A trigger covers all three
without any of them naming the column, which is the reason to prefer one here.

Both triggers only fire when `row(NEW.*) IS DISTINCT FROM row(OLD.*)`, so an UPDATE
that changes nothing does not move the stamp. Queries that set `last_update = now()`
themselves — `replaceState`, `updateRounds`, `updateStateRounds`, `touchDivision` —
are unaffected by that guard, because assigning the column is itself a change.

### What the stamps are for

`GET /api/tournaments/:tournamentId` builds an ETag from the greatest `last_update`
across the tournament row and its divisions. A change a reader can see therefore has
to move one of those two columns, or the client is told its cached copy is current.

`teams` and `fixtures` carry no `last_update` and no trigger, and two writes reach
them without touching a stamped row:

- a team rename, which writes only to `teams`;
- recording a result on a fixture whose round is absent from `divisions.state`, which
  skips the state write.

Both call `divisionsRepository.touchDivision` so the division's stamp moves anyway.
Every other write already stamps: progression and score entry go through the state
queries above, and the tournament's own writes go through the trigger.

### Outstanding check on `tournaments.last_update`

The column is recorded above as `DEFAULT now() NOT NULL`, matching `divisions`. The
Phase 5 handover described it as nullable. One of the two is wrong and it has not been
confirmed against the live database. It matters because a null stamp is treated as
"unknown, always refetch" — correct but never cached. To settle it:

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'tournaments' AND column_name = 'last_update';

SELECT count(*) FROM tournaments WHERE last_update IS NULL;
```

If it is nullable, backfill and constrain rather than teaching the reader to cope:

```sql
UPDATE tournaments SET last_update = now() WHERE last_update IS NULL;
ALTER TABLE tournaments ALTER COLUMN last_update SET DEFAULT now();
ALTER TABLE tournaments ALTER COLUMN last_update SET NOT NULL;
```