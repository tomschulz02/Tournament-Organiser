# Gap Analysis

Date: 2026-08-08. A survey of the whole repository — `api/`, `tourganiser-ui/` and
`docs/` — looking for things that are missing, unfinished, wrong, or structurally
awkward.

## How to read this

Every item has an ID (`D1`, `B4`, `F7`…) so we can refer to it in discussion without
retyping it. IDs are stable; treat them as permanent handles.

This document does **not** repeat what is already catalogued. Two existing artefacts
already do a good job and remain the source of truth for what they cover:

- `docs/known-limitations.md` — the standing list of deferred and broken things.
- `api/test/known-bugs/known-bugs.test.js` — ten specific defects, each written as a
  failing test that names the exact line at fault. This is the best asset in the repo
  for this purpose and should stay the mechanism for tracking defects.

What follows is what those two do **not** already cover, plus a note on where they have
themselves gone stale.

This is a description, not a plan. The plan it produced lives in `docs/roadmap.md`,
which tracks status; this document is a dated snapshot and is allowed to go stale.

## Status

Reviewed with the maintainer on 2026-08-08. Settled since:

- **C1 confirmed.** `database.md` is correct — `teams` has `id`, `name` and `user_id`.
  Tournament creation is therefore broken in production.
- **D1–D4 fixed**, and **B12 fixed** — the known-bug suite is out of the default test
  run and behind `vitest.bugs.config.js`.
- **X1 decided**: no migration tooling. Schema changes are applied by hand and
  `database.md` is overwritten to match, with git holding the history.

Everything else below is still open. See `docs/roadmap.md` for the order of work.

---

## Summary

Three structural gaps dominate everything else. Every individual item below is a
symptom of one of them.

**S1 — The application can create a tournament and display it, but cannot run one.**
Score entry, round progression, starting, ending and deleting a tournament are all
unreachable. The components exist. The services exist. Nothing connects them. This is
the difference between a demo and a product, and it is a single coherent piece of work
rather than a scattering of small ones.

**S2 — Authority over tournament state is split between the client and the server, and
the split is not decided.** `progression.service.js` takes the modern position: the
server owns the rules, the client proposes and the server revalidates. `requests.js`
takes the old one — `updateRounds(divisionId, rounds, qualifiedTeams, standings,
fixtures, currentRound)` has the browser posting the authoritative state of the
tournament. Both designs are in the codebase at once. Which one wins determines the
shape of roughly half the outstanding backend work, so it should be settled before any
of it is written.

**S3 — There is no consistent contract at any boundary.** Repositories sometimes throw
and sometimes return an error string. Controllers sometimes return `data` and sometimes
`message`. Fixture status has two vocabularies. Errors are stringified into
`new Error(error)`, losing their type. Each of these is individually small; together
they are why a bug in one layer surfaces as a confusing symptom three layers away.

---

## 1. Documentation drift

The docs are unusually good — better than the code they describe. That makes the places
where they have fallen behind actively dangerous, because they are trusted.

**D1 — The docs and `CLAUDE.md` say there is no test suite. There is a substantial
one.** `CLAUDE.md` states "No test suite exists. Do not claim a change is verified by
tests." `README.md` says "There is no test suite." `known-limitations.md` says "No
automated tests, and no test runner configured in either package." In fact `api/` has
Vitest, Supertest, ~25 test files across unit, integration and known-bug suites, and a
coverage gate set to 100% on all four metrics. An agent following `CLAUDE.md` will not
run the tests it should be running.

**D2 — `architecture.md` describes `divisions.controller.js` and `divisions.route.js` as
empty.** Both are implemented, for the progression endpoints. The "Current State"
section is the map the doc tells you to trust, and it is out of date.

**D3 — `known-limitations.md` refers to `getTeamNamesByDivision`.** No such function
exists in `divisions.repository.js`. Minor, but it is in a list of things to fix.

**D4 — `roadmap.md` is an empty stub.** Seven suggested section headings and no
content. This document is partly an attempt to give it something to hold.

---

## 2. Critical path

Things that appear to be broken end to end, not merely incomplete.

**C1 — Tournament creation cannot succeed against the documented schema.**
`divisions.service.js` calls `divisionsRepository.createTeam()` with no arguments
inside a loop whose `team` variable is never used (this is known bug 3). `createTeam`
then executes `INSERT INTO teams (id, name, division_id)`. Per `database.md` the
`teams` table has no `division_id` column, and `name` is `NOT NULL`. So the insert
raises, `createDivision` throws, `createTournament` deletes the tournament it just made
and returns `DATABASE_ERROR`.

Two possibilities, and it matters which: either the live Neon database has a
`division_id` column that `database.md` omits, or **creating a tournament is currently
broken in production**. Worth checking directly before anything else is decided.

**C2 — `createDivision`'s transaction does not cover most of what it writes.** It opens
a client and issues `BEGIN`, but:

- `createTeam` uses the module-level `db`, not the transaction client, so team rows are
  written outside the transaction.
- `fixtureService.createFixture(divisionId, fixture, client)` accepts a client and then
  calls `fixturesRepository.createFixture(...)` without passing it on — so fixtures are
  also written outside the transaction.
- The `forEach` over fixtures is not awaited. `COMMIT` runs before the inserts finish.

The `ROLLBACK` therefore undoes only the `divisions` row. A partial failure leaves
orphaned teams and fixtures behind. The transaction is currently decorative.

**C3 — The UI offers a tournament format the backend rejects.**
`TournamentCreation.jsx` maps "Single Elimination" to `type: 'single_elim'`, and
`generateDivisionDetails` throws `FORMAT_NOT_IMPLEMENTED` for that value. Related:
`location` is optional in the creation form but `NOT NULL` in the schema, so leaving it
blank surfaces as a 500.

---

## 3. Backend

**B1 — Repositories have two incompatible error conventions.** Newer functions throw
(`getDivisionWithOwner`, `updateRounds`, `getTeamsByIds`, `updateSchedule`). Older ones
`return` an error string from the `catch` (`updateTeams`, `updateTeam`,
`getDivisionDetails`, `getFixtures`, `getResults`, `updateResult`, `createFixture`,
`getAllTournaments`, `startTournament`, `endTournament`, `deleteTournament`). A caller
cannot tell success from failure without inspecting the shape of what came back —
`getAllTournaments` failing returns a string, which `fetchTournaments` then iterates as
if it were rows. This needs one convention, chosen deliberately.

**B2 — `updateResult` can return a client to the pool mid-transaction.** On
`FIXTURE_NOT_FOUND` it returns from inside the `try` after `BEGIN`, with no `COMMIT` or
`ROLLBACK`. The `finally` then releases the client with the transaction still open.
Pool poisoning; intermittent and unpleasant to diagnose.

**B3 — Errors are stringified rather than wrapped.** `db.js` does `throw new Error(err)`,
as do `divisions.service.js` and `fixtures.service.js`. This discards the Postgres error
code, the constraint name and the stack — exactly the information needed to map a
failure to a 400 rather than a 500. `cause` or a small typed error would keep it.

**B4 — There is no central error handler and no 404 handler.** `app.js` mounts four
routers and nothing else. Every controller hand-rolls its own try/catch and its own
status mapping; `divisions.controller.js` has a good `ERROR_STATUS` table that the other
controllers do not use. An unmatched path falls through to Express's default HTML page.

**B5 — `completedGames` is never maintained.** `updateResult` takes a `rounds` argument
and ignores it. Nothing increments `round.completedGames` when a fixture completes. The
backend works around this — `isRoundComplete` recomputes from the fixture rows — but the
UI's round progress bar reads `completedGames` directly, so it will sit at zero forever.
Either the field is derived and should not be stored, or it is stored and must be
written. Currently it is neither.

**B6 — Editing groups before the tournament starts does not regenerate fixtures.**
`updateGroups` takes a `fixtures` parameter and ignores it, updating only
`state.rounds[0].groups`. Changing pool composition leaves the previously generated
fixtures in place, now describing matchups that no longer exist.

**B7 — Team ownership is undefined.** `teams.user_id` is `NOT NULL` with a foreign key
to `users`, and `createTeam` never sets it. Even once the `division_id` drift is fixed,
there is no answer to "who owns a team". Options: the organiser who created it, a
future team-captain account, or drop the column. This is a schema question and needs a
decision, not a patch.

**B8 — Derived data is stored alongside its source.** `divisions.num_teams` duplicates
`state.teams.length`. `round.totalGames` duplicates `round.fixtures.length`. Neither has
anything keeping it honest.

**B9 — No validation layer.** Already noted in `known-limitations.md`; repeating it here
because it interacts with B3 — without preserved Postgres error codes, oversized input
can only ever be a 500.

**B10 — No health endpoint and no graceful shutdown.** Render sends `SIGTERM`; nothing
closes the pool. There is no cheap endpoint to check liveness against.

**B11 — Dead and duplicated repository code.** `fixturesRepository.getFixtures` and
`getResults` have no callers. `divisionsRepository.getDivisionDetails` duplicates what
`getDivisionsByTournamentId` plus `fixturesRepository.getFixturesByDivisionIds` already
do, and is the only remaining user of the "return an error string" pattern in that file.

**B12 — `npm test` cannot pass, by design.** `vitest.config.js` includes
`test/**/*.test.js`, which sweeps in `test/known-bugs/`, a suite written to fail until
the ten bugs are fixed. So the default test command is permanently red, which makes it
useless as a signal. The intent is sound; the wiring should exclude `known-bugs` from
the default run and keep it behind `npm run test:bugs`.

---

## 4. Frontend

**F1 — Six components are built and mounted nowhere.** `NextRoundModal` (211 lines),
`ScoreUpdateModal` (87), `CollectionView` (63), `FixturesDoc` (96), `SummaryPage` (80)
and `Tooltip` (46) have no importer anywhere in the app. That is ~580 lines of working,
reviewed, unreachable UI — and it is precisely the organiser's control surface. This is
the concrete form of S1.

**F2 — Half of `requests.js` has no caller.** Ten of twenty exported functions are never
called: `createCollection`, `fetchUserCollections`, `joinTournament`, `leaveTournament`,
`startTournament`, `endTournament`, `deleteTournament`, `updateTeams`, `updateRounds`,
`updateScore`. All ten also lack a backend. They describe an intended feature set rather
than a working one, which is a reasonable thing for them to be — but it should be
recorded as such rather than left looking like live code.

**F3 — `TournamentView` has no organiser controls at all.** Even for `creator === true`
the view offers exactly one action: open the schedule maker. There is no start, no end,
no delete, no score entry, no advance-round. The `creator` flag is computed by the
backend, passed all the way down, and used only to change a button's label from "View
Schedule" to "Open Schedule Maker".

**F4 — The Collections feature is entirely fictional.** Two request functions, one
component, and a field in the creation summary — with no table in `database.md`, no
endpoint, and no route. `CollectionView` also reads the old response envelope
(`collection.message`, `tournament.message.details`), so it would not work even if the
endpoints appeared. Decide whether Collections is a real roadmap item or should be
deleted.

**F5 — `requests.js` is ~378 lines of the same twelve lines repeated twenty times.**
Every function is `try { fetchWithRetry(...) } catch { if (error.isConnectionError)
return { error } ; throw }`, differing only in path, method and body. One `apiRequest`
helper would reduce it to roughly a third, and would give a single place to fix the
error-shape coupling described in `docs/api.md` when the backend contract changes.
`deleteTournament` already deviates — it swallows every error rather than rethrowing.

**F6 — The retry in `fetchWithRetry` is dead code.** It retries only when the error
message contains `reset` or `network`. A failed `fetch` throws `TypeError: Failed to
fetch` in Chrome and `NetworkError when attempting to fetch resource` in Firefox — so
the branch fires on some browsers and not others, and never on the one most users are
on. `MAX_RETRIES = 5` is effectively `0`.

**F7 — Fixture status has two vocabularies.** The database enum is `UPCOMING`, `LIVE`,
`COMPLETED`, `CANCELLED`. The frontend filters on `WAITING` and `ONGOING`, and
`ViewTabs` maps back with `{ ONGOING: 'LIVE', WAITING: 'UPCOMING' }`. The translation
happens in `tournamentViewFormatter.js`. This is not merely untidy — it is the direct
cause of known bug 5, where the re-progression guard checks for `LIVE` while the rest of
the system says `ONGOING`. One vocabulary should win, and the translation layer should
be removed rather than made consistent.

**F8 — Direct DOM manipulation inside React components.** `CollectionView` reads
`document.getElementById`, toggles classes and writes inline pixel widths onto elements
owned by `Browse`. `App.jsx` attaches a `scroll` listener that queries the DOM on every
event and is never removed. Both work; both will break in ways that are hard to trace
the moment the markup moves.

**F9 — Dead-end navigation.** Profile, Friends and Saved Tournaments are inert `<div>`s
in the menu with a comment saying to convert them to `<Link>`s once the pages exist.
`HelpMenu` renders one sentence of placeholder text. Privacy Policy and Terms of Service
both link to `/terms`. There is no profile route, and `GET /api/users/profile/:id` is
the stub that hangs (already in `known-limitations.md`).

**F10 — No route guards and no redirect for logged-in users.** `Login.jsx` carries a
`TODO` for the latter. Nothing prevents an unauthenticated user reaching a page that
assumes a session — currently harmless only because no such page exists yet.

**F11 — CSS is ~7,800 lines across three files with no boundaries.** `App.css` alone is
5,849 lines and is imported by five different modules. There are 210 class selectors
defined in more than one place, and two separate `body.light` / `body.dark` blocks
inside `App.css` (lines 33/41 and 5069/5081). 38 custom properties exist, so there is
the beginning of a token system, but it is not applied consistently. Given `depcheck` is
already a devDependency, someone has thought about this before.

**F12 — No frontend tests.** `api/` has a thorough suite; `tourganiser-ui/` has none,
and no runner configured. The schedule generator and `scheduleUtils` are pure functions
with real logic in them and would be cheap to cover.

---

## 5. Cross-cutting

**X1 — No migration tooling.** Schema changes are applied by hand against Neon, and
`database.md` is a hand-maintained transcript. This is the mechanism by which C1 became
possible: there is no way to tell whether the live schema matches the document.

**X2 — One environment.** No staging. Every schema change is applied to production
first.

**X3 — No CI.** The test suite exists but nothing runs it automatically, so the 100%
coverage gate only binds when someone remembers.

**X4 — Backend has no linter.** `tourganiser-ui/` has ESLint; `api/` has nothing.

**X5 — Ownership checks are absent everywhere except progression.**
`progression.service.js` has the right pattern — `getDivisionWithOwner` returns
`created_by` and the service compares it to `req.user.id`. Nothing else does this, and
every pending mutation endpoint will need it. This should be settled as a reusable
approach before those endpoints are written, not bolted on afterwards.

**X6 — Security items already listed in `docs/api.md`** (rate limiting, `helmet`,
`saltRounds`, input length limits) are unaddressed. They are correctly deferred; noting
them so they are not lost.

**X7 — `docs/` and `CLAUDE.md` are untracked by git**, per `known-limitations.md`. If
that is still true, this document is untracked too.

---

## 6. Roadmap

Moved to `docs/roadmap.md`, which is the living document. A roadmap changes; a gap
analysis is a snapshot. Keeping the roadmap inside this file would leave it to rot here.

The phases were renumbered when it moved, because confirming C1 promoted the critical
path to a phase of its own. Item codes are unchanged.

---

## 7. Open questions for discussion

These are the decisions I cannot make from the code, and they are where the design
conversation should start.

1. ~~**Is tournament creation actually working in production right now?**~~ (C1)
   Answered: no. `database.md` is correct, so `createTeam` cannot insert. This is now
   Phase 1 of the roadmap.
2. **Where does authority over tournament state live?** (S2) Server-authoritative is the
   direction `progression.service.js` already went, and it would mean deleting most of
   the `updateRounds` payload rather than implementing it — but it is a real choice.
3. **What is a team?** (B7) A row owned by the organiser, an entity that can outlive a
   tournament, or something a future user account can claim? `teams.user_id` implies the
   third and nothing implements it.
4. **Is Collections a feature or an abandoned idea?** (F4)
5. **How much does live scoring matter?** It is in `future-features.md`, and the answer
   changes whether F7's status vocabulary needs a `LIVE` state with real semantics or
   just a label.
6. **Is `divisions.state` staying schemaless?** `division-state.md` notes nothing
   enforces its shape. Validating on write is cheap; deciding to live with it is also
   legitimate, but it should be a decision.
