# Roadmap

Ordered by dependency, not by appetite. Each phase is a coherent unit that leaves the
application in a better state than it found it.

Item codes (`C1`, `B7`, `F3`…) refer to `docs/gap-analysis.md`, which describes each one
in full. This document says what to do and in what order; that one says why.

Last reviewed 2026-08-13.

---

## Phase 0 — Establish ground truth

Complete.

- **C1 confirmed.** `docs/database.md` is correct. The `teams` table has `id`, `name`
  and `user_id`, and no `division_id`. Tournament creation is therefore broken in
  production, not merely fragile.
- **D1–D4 fixed.** `CLAUDE.md`, `README.md`, `architecture.md` and
  `known-limitations.md` now describe the repository that exists, including the test
  suite they previously denied.
- **B12 fixed.** The known-bug suite no longer runs as part of `npm test`, so the
  default test command is a usable signal again.
- **X1 decided: no migration tooling.** Schema changes are rare enough that applying
  them by hand and updating `docs/database.md` to match is proportionate.
  `docs/database.md` stays the source of truth and is overwritten rather than
  accumulating historical schemas; git holds the history.

## Phase 1 — Restore the critical path

Nothing else can be exercised end to end until a tournament can be created.

- ~~**C1**~~ — **done 2026-08-09: team creation works.** `createTeam` takes an id and
  inserts `(id, name, division_id)`, on the caller's client. `divisions.service.js`
  generates the ids up front, writes the division row first — teams carry a foreign key
  to it — then the teams, then the fixtures, and rejects a team entered twice or an entry
  carrying no name. First done on 2026-08-08 against `user_id`, which the schema does not
  have; see B7.
- ~~**B7**~~ — **reversed 2026-08-09: there is no `teams.user_id`.** The 2026-08-08
  settlement had `createTeam` insert the organiser's id, which no column could hold, so
  every tournament creation returned a 500. The reversal took the code down to the schema
  rather than migrating the schema up to the code: a team belongs to exactly one
  division, `getTeamsByUserId` is gone, and selecting an existing team by id is gone with
  it. What that gives up is recorded in `docs/decisions.md` — a team can no longer be
  followed across tournaments.
- ~~**C2**~~ — **done 2026-08-08: creating a tournament is one transaction.** A
  `withTransaction` helper on the connection in `api/src/config/db.js` owns the client;
  `createTournament` opens the boundary and threads it through every division, team and
  fixture insert. `createDivision` no longer opens its own client, both loops are
  sequential because one pg client cannot run concurrent queries, and the compensating
  `deleteTournament` is gone — the rollback does that work, and it also covers the case
  the delete never could, where the tournament insert itself failed.
- ~~**C3**~~ — **done 2026-08-08: the form no longer produces input the backend
  rejects.** Single Elimination is offered but disabled, `location` is required and
  capped at the 50 characters the column allows, `name` is capped at 50 as a soft limit,
  and the oversize-location error now reports on the location field rather than the name
  field. `generateDivisionDetails` throws `AppError` for both unsupported-format cases,
  so client-side validation is not the only check.

The related drift is fixed with C1: `getTeamsByDivisionIds` is gone, with
`tournaments.service.js` resolving each division's teams from `state.teams` through
`getTeamsByIds`, which stays the way teams are resolved because `state.teams` owns seed
order; `getTeamNames` is gone entirely; and the `RETURNING num_groups` in `updateTeams`
is dropped.

### Also critical, found 2026-08-09 — all three fixed 2026-08-09

- **Round-robin fixture generation produces nothing.** This is known bug 2.
  `createLeagueState` writes `groups: [[teams]]` — one level too deep — so
  `generateRoundRobinFixtures` sees a single "team" that is itself an array, pairs it
  with a `BYE`, and skips the fixture. A League division therefore has zero fixtures and
  an empty standings table. `createClassicState` uses `populateGroups`, which nests
  correctly, so pool play inside a Classic division is unaffected. One-line fix; move
  known bug 2's test into `divisions.service.test.js` with it.
- **Logging out leaves the page stale.** `creator` is resolved server-side and held in
  the tournament view's single request, so after logout the organiser controls stay
  visible until something else triggers a refetch. Logout should invalidate the cached
  tournament data, not just the session flag.
- **Creating a tournament appears to do nothing.** `TournamentCreation` does navigate on
  success — to `/tournaments`, which is the route that renders `Browse`, which is where
  the creation form already lives. The navigation succeeds and nothing visibly changes.
  Redirect to `/tournaments/view/:id` instead; the id is in `data.id` on the creation
  response.

## Phase 2 — Settle the contracts

Decisions that constrain everything after them. Mostly discussion, little code.

- ~~**S2**~~ — **settled 2026-08-08: the server has authority.** Recorded in
  `docs/decisions.md`. Consequences, to be applied as each endpoint is built:
  `updateRounds` is deleted from `requests.js` rather than implemented, since the
  progression endpoints supersede it; `updateScore` narrows to `(fixtureId, scores)`,
  with the server deriving winner, status and round completion; `updateTeams` keeps its
  shape, with the server validating membership before rewriting `state.teams`.
- ~~**B1, B2, B3, B4, F5, F6**~~ — **done 2026-08-08: typed errors with a central
  handler.** Contract in `docs/api.md`, reasoning in `docs/decisions.md`. This was the
  one piece of Phase 2 that was substantial code rather than a decision, and it was High
  Risk under `CLAUDE.md` — architecture plus shared business logic.

  Delivered: `api/src/errors.js` (the `AppError` type and the catalogue, generalised from
  `ERROR_STATUS`); `notFound` and `errorHandler` middleware wired last in `app.js`;
  `requireAuth` handing its 401 to the same middleware; one `request` helper in
  `requests.js` that reads `message`, preserves the HTTP status and throws an `ApiError`;
  and every endpoint converted with its callers. Repositories throw and wrap `cause`,
  services throw typed errors naming a condition, no controller catches.

  Cleared three live defects — "Welcome, undefined", the object stored as a username, and
  the empty error toast — plus the 500 on a duplicate signup email, which is now a 409.

- ~~**F7**~~ — **done 2026-08-08: the `fixture_status` enum is the only vocabulary,
  and the server derives the status.** Recorded in `docs/decisions.md` and
  `docs/tournament-rules.md`. The work: remove the translation in
  `tournamentViewFormatter.js` and the `statusMap` in the old tournament view, and change that
  component's filters to the enum values. **Known bug 5 is fixed by this** — move its
  test out of the known-bug suite. Best done immediately before score entry in Phase 3,
  since that endpoint is what writes the status.
- ~~**X5**~~ — **settled 2026-08-08: the check stays in the service.** Recorded in
  `docs/decisions.md`. `requireAuth` proves identity, the service proves permission, and
  every mutating service function takes `userId` as a required parameter. Two resolvers
  still to write — one for a fixture id, one for a tournament id — each returning the
  row plus its owner. Build them with the Phase 3 endpoints that need them.
- ~~**Path naming**~~ — **settled 2026-08-08: REST conventions.** Nouns only, plural
  collections, actions as sub-resources. The full replacement table is in `docs/api.md`.
  Collections are removed outright, since a tournament with multiple divisions replaced
  them — this also closes **F4** ahead of Phase 6.

Phase 2 is complete. Everything below is implementation.

## Phase 3 — Make the tournament runnable

**Complete 2026-08-09.** A tournament can now be created, started, scored, progressed and
finished from the UI, which had never been possible end to end before.

- ~~**Score entry**~~ — `PUT /api/fixtures/:fixtureId/result` takes `{ sets, finished }`
  and derives the status per the F7 decision, maintaining `round.completedGames` in the
  same transaction, which settles **B5**. `ScoreUpdateModal` is mounted from `View.jsx`
  and offered only on fixtures whose teams are bound.
- ~~**Round progression**~~ — `NextRoundModal` is mounted, triggered from the Standings
  tab once the current round is complete and another follows.
- ~~**Tournament lifecycle**~~ — start, end and delete are live on the resource-first
  paths, each checking ownership in the service so that "no such tournament" and "not
  yours" are distinguishable.
- ~~**X5's fixture resolver**~~ — `fixturesRepository.getFixtureWithOwner` joins fixtures
  to divisions to tournaments. The tournament-level one is `getTournamentById`, which
  already returned `created_by`.
- ~~**F3**~~ — done 2026-08-08 by the tournament view redesign.

Two things outside the plan had to be fixed to get here, both recorded in
`docs/known-limitations.md`: a trigger on `divisions` that made **every** UPDATE to that
table fail, and a bracket that read rank placeholders instead of the teams progression
had bound.

### Tournament view polish

**Complete 2026-08-11.** Small, and independent of the endpoints above.

- ~~**The fixture card's right-hand side is cramped and does not align.**~~ — **done
  2026-08-11.** `.tv-fixture-rows` owns the columns and each row is a
  `grid-template-columns: subgrid` of them, so the widths are shared across the whole
  list rather than recomputed per row. Court, division and round are three columns
  instead of one flex cell, placed by class rather than by order, so a row missing a
  slot leaves the column empty instead of pulling the next one into it. The spacing
  between columns rides on the cells rather than on the grid gap, because a gap is
  charged whether or not anything fills the column — a single-division list would
  otherwise pay for a badge column nobody uses. All three trailing labels stay
  `nowrap`.

  One limit worth knowing: `ScheduleTab` renders a list per time group, so columns line
  up within a group and not across them. Making them align down a whole day would mean
  subgridding the schedule's own grid, which is a larger change than this was.
- ~~**Status should be a colour indicator, not a word**~~ — **done 2026-08-11.** A dot
  in the row's first column: blue upcoming, green live, red completed, muted cancelled.
  The outcome column now carries a score or nothing. The row's left edge stays the
  neutral border on every status — settled 2026-08-11, one fact encoded once, so there
  is nothing for the dot to disagree with. The dot is `aria-hidden` and carries the
  label as a `title`; the label itself sits beside it as visually hidden text, which is
  what a screen reader reads. Putting the `title` on the `<li>` instead made the status
  the list item's accessible name and got it announced twice.

## Phase 3.5 — Teams

**Complete 2026-08-10.** `PUT /api/divisions/:divisionId` takes a division's full team
list plus `num_groups` and `knockout_teams`, and decides from the submitted ids whether
it is renaming or rebuilding. A rename writes names only. A rebuild is gated on
`Not Started` **and** no completed fixture, validates the structure against the new team
count before opening a transaction, then deletes the division's fixtures, reconciles the
team rows, rewrites `state`, regenerates, and repairs `tournaments.schedule` by dropping
only the entries pointing at deleted fixtures — under a `SELECT ... FOR UPDATE` on the
tournament row so a concurrent save cannot clobber it.

The three per-team stubs are gone, and `updateGroups` and `updateTeams` went with them,
closing **B6**. Team edits batch on the client and commit once; a changed team set opens
a structural confirmation first.

The original scope follows.

Reverses B7. The schema is already changed: `teams (id, name, division_id)`, with no
`user_id`. Do this before Phase 4, because changing a team invalidates fixtures and any
schedule built on them.

- ~~**Rework team creation for the new schema**~~ — **done 2026-08-09.** `createTeam`
  takes a team id and a division id. `getTeamsByUserId` is gone, and selecting an
  existing team by id with it, along with `TEAM_NOT_OWNED`. `getTeamsByDivisionIds` was
  **not** restored: a query by division cannot preserve seed order.
- ~~**Decide which side owns membership**~~ — **settled 2026-08-09**, recorded in
  `docs/division-state.md`. `state.teams` is authoritative for order; `teams.division_id`
  is the foreign key, carrying cascade delete and cheap lookup.
- ~~**Blast radius**~~ — **settled 2026-08-09**, recorded in `docs/decisions.md`, and
  ~~**built 2026-08-10**~~. Changing a division's teams regenerates its structure;
  renaming does not.

  1. ~~**One endpoint, `PUT /api/divisions/:divisionId`**~~, taking the division's full
     intended team list plus `num_groups` and `knockout_teams`. The three 501 team stubs
     were removed rather than implemented — teams and structure cannot be changed
     independently, so three endpoints would be three ways to leave a division
     inconsistent.
  2. ~~**The service derives intent from the data**~~, comparing incoming ids against
     `state.teams`. Same set means a rename: update names, stop. Different set means
     rebuild. The client never declares which it is doing, per the server-authority
     decision.
  3. ~~**Gate on `status === 'Not Started'`**~~, plus no `COMPLETED` fixture in the
     division. Real rather than decorative, because Phase 3 shipped the lifecycle
     endpoints first.
  4. ~~**Rebuild**~~ = delete the division's fixtures, regenerate `state.rounds` through
     `generateDivisionDetails`, regenerate fixtures through `generateFixtures`, write the
     new `state.teams`. Creation and rebuild share one generation path, so a rebuilt
     division is indistinguishable from a freshly created one.
  5. ~~**Repair the schedule, do not discard it.**~~ Only the changed division's entries
     leave `tournaments.schedule`; breaks and every other division's placements stay.
  6. ~~**Batch on the client.**~~ Edits accumulate in `TeamsTab` and commit once, so the
     structural confirmation is asked a single time.

- ~~**The confirmation UI**~~ — **done 2026-08-10.** The creation form's division step
  could not be lifted cleanly: it is bound to that form's error-key scheme and its own
  team list, so its shape was copied into a dialog in `TeamsTab` instead. It opens on the
  division's current group and qualifier counts, read back out of `state.rounds`,
  validates against the new team count, and flags an impossible combination rather than
  correcting it.
- ~~**B6**~~ — **closed 2026-08-10.** `divisionsRepository.updateGroups` was deleted
  rather than fixed. It rewrote `state.rounds[0].groups` without regenerating anything and
  nothing called it; group composition now moves only through a rebuild.
- **Add and remove division** as their own capability, independent of the above. Still
  outstanding.

## Phase 4 — Close the loop on scheduling

**Complete 2026-08-10.** A schedule can now be built by hand or generated, corrected by
dragging, saved to the server against real validation, and previewed before printing.

The generator stays in the client and the server validates on write — settled
2026-08-08, see `docs/decisions.md`. The schedule lives on `tournaments.schedule`.

### Persistence

- ~~**Document the shape of `tournaments.schedule`**~~ — **done 2026-08-10.**
  `docs/schedule.md` is the contract, and is now listed under Source of Truth in
  `CLAUDE.md`. It records the two surprises the validator had to account for: an entry
  missing `id`, `day`, `startTime` or `endTime` is silently dropped by the client, and
  `days` is regenerated from the tournament's dates on every read.
- ~~**The validator**~~ — **done 2026-08-10.** `api/src/utils/scheduleValidator.js`, one
  error code per rule rather than one `INVALID_SCHEDULE`, with the offending entry ids in
  `data`. Partial schedules are legal and an empty one is legal.
- ~~**`PUT /api/tournaments/:tournamentId/schedule`**~~ — **done 2026-08-10**, replacing
  the 501. The write takes the tournament row lock **before** reading the fixtures it
  validates against, so it cannot race a division rebuild repairing the same column in
  either direction. Rejections are listed in `docs/api.md`.

### Generator correctness

- ~~**Rounds must not overlap in time**~~ — **done 2026-08-10.** Fixtures are placed
  round by round and a slot is discarded outright if it would start a round before an
  earlier round of the same division has finished — a hard constraint, not a score. The
  rule is in `docs/tournament-rules.md` under Scheduling. Divisions still run in
  parallel; only within a division is the order enforced.

### Schedule maker UX

- ~~**The modal is sized wrong**~~ — **done 2026-08-10.** It is portalled onto
  `document.body` and raised above the header's `z-index: 1000` and the footer's `10`;
  `.modal-backdrop`'s own `5` was what cut it off. It now also traps focus and closes on
  Escape, which `aria-modal="true"` had been claiming without delivering.
- ~~**Multiple fixtures render in the same court-and-time cell**~~ — **done 2026-08-10.**
  The grid's rows are built from the union of the slot ladder and every entry's own start
  and end, so an entry that does not land on a slot boundary gets an exact row instead of
  falling through `findIndex`'s −1 to row 1. An entry naming a court the schedule no
  longer has is listed beneath the grid rather than silently drawn on court 1.
- ~~**Placed fixtures cannot be moved**~~ — **done 2026-08-10.** A placed entry is
  draggable and carries its entry id; a cell's drop handler tells a move from a
  placement by the payload's prefix. A move keeps the entry's duration, is validated the
  same way a new placement is, and is refused onto a cell occupied by anything other than
  itself.
- ~~**There is no manual placement at all**~~ — this already worked; the sidebar pill was
  `draggable` and the cells took the drop. Confirmed 2026-08-10.
- ~~**PDF export should open the browser's print dialog**~~ — **done 2026-08-10.** The
  immediate download is gone, replaced by `window.print()` and an `@media print` block
  keyed on a body attribute, with named pages giving the grid landscape and the list
  portrait. **The lazy chunk went from roughly 427kB to 30kB.** `jspdf` and `html2canvas`
  were removed from `package.json` on 2026-08-10, with approval, taking `dompurify` with
  them as a transitive dependency. Nothing imports them and nothing replaced them.

## Phase 5 — Correctness and consolidation

**Complete 2026-08-11.** The coverage gate is back at 100 and CI now runs both packages.
Six of the seven known bugs are fixed and their tests moved into the regular suites, so
`npm run test:bugs` reported only bug 10 — the friends and saved-tournament queries,
which covered unreachable code for a feature that had no schema. The Profile page (below)
fixed three of bug 10's five cases; `npm run test:bugs` now reports only `addFriend` and
`getFriends`, tied to the future Friends/Editors-and-scorers feature.

`helmet` and `express-rate-limit` are installed, login and signup are throttled with a
429 that goes through the error catalogue like everything else, and `saltRounds` is 12.
Input length is checked at the service boundary through `assertText`, which names the
offending field in `AppError`'s `details`. There is a health endpoint and `SIGTERM` closes
the pool. `getDivisionDetails` and the leaking scroll listener are gone, closing **B11**
and **F8**.

Client caching is an ETag on `GET /api/tournaments/:tournamentId`, built from the greatest
`last_update` across the tournament and its divisions **and the viewer** — because the
payload carries `creator`, a validator built from the timestamp alone would serve an
organiser's copy to a signed-out reader on a 304. `Vary: Cookie`, `Cache-Control:
no-cache`, and Express's own automatic ETag disabled so the only one sent is deliberate.
The client half is `requests.js`, which holds `{ etag, payload }` per tournament in
`sessionStorage` — a module-level `Map` at first, moved on 2026-08-17 so that it survives
the reload it exists for. See `docs/decisions.md`.

Making that work took two things beyond the plan:

- **Two writes had to start stamping.** A team rename touches only `teams`, which has no
  `last_update` and no trigger, and a result on a fixture whose round is absent from
  `state` skips the state write. Both would have changed what a reader sees while the
  change key stood still, so both now call `divisionsRepository.touchDivision`.
- **Two CORS settings are load-bearing**, and both were missing at first: `ETag` must be
  in `exposedHeaders` or cross-origin JavaScript reads null and the cache is silently
  inert, and `If-None-Match` must be in `allowedHeaders` or the browser blocks the
  request at the preflight. Neither is visible to the test suite — supertest does not
  enforce CORS — and both were found by loading the real page against the real API.

`tourganiser-ui` has tests for the first time, closing **F12**: vitest over the pure
modules — `scheduleUtils`, `scheduleGenerator`, `fixtureUtils` — plus `requests.js`,
whose tournament cache decides whether one reader can be shown another's payload. No
coverage threshold on the UI yet, deliberately: a gate over four files out of forty
would be theatre. CI runs the suite, then lint, then build.

### Outstanding from Phase 5

- **`trg_tournaments_last_updated` has been applied to the database.** It is recorded
  in `docs/database.md` with the statement to run. Until it exists, division-level
  changes invalidate the cache correctly but tournament-level ones — a schedule save,
  start, end — do not, because nothing moves `tournaments.last_update`.
- **Whether `tournaments.last_update` is nullable is unconfirmed.** `docs/database.md`
  records it as `NOT NULL DEFAULT now()`; the Phase 5 handover described it as nullable.
  The verification and backfill statements are in `docs/database.md`. A null stamp is
  handled — it means "unknown, always refetch" — so this costs caching, not correctness.
- **X4, a linter for `api/`, was not done.** It was in the original scope below and never
  entered the handover. `tourganiser-ui` keeps a baseline of five pre-existing ESLint
  errors; CI fails only if that count grows, which is stated in the workflow.
- Division and team names are still unvalidated — `assertText` covers `users` and
  `tournaments` only. Recorded under Security in `docs/api.md`.

The original scope follows.

- The remaining known bugs in `api/test/known-bugs/`, worked through as the surrounding
  code is touched, per the existing "fix drift when you touch it" rule.
- **B9** input validation, and the deferred security items in `docs/api.md` — rate
  limiting, `helmet`, `saltRounds`.
- **B2** the pool-poisoning return in `updateResult`, **B10** health endpoint and
  graceful shutdown, **B11** dead repository code.
- Frontend consolidation: **F5** the repetition in `requests.js`, **F6** the dead retry,
  **F8** direct DOM manipulation, **F11** the CSS.
- **X3** CI, **X4** a linter for `api/`, **F12** frontend tests.
- **Restore the coverage gate to 100.** `vitest.config.js` sets 95 while `CLAUDE.md`
  claims 100 and actual coverage is 100.

### Client-side caching

As scoped. Every question here was answered; the answers are in the summary above and in
`docs/api.md`, and two of the bullets were wrong by the time the work started.

- ~~Cache the tournament payload and refetch only when the server says it changed.~~
  Done as a conditional request rather than a client-side comparison: the server owns the
  validator and answers 304, so the client never has to decide whether its copy is stale.
- ~~**Every write to `divisions` must stamp `last_update`.**~~ Two did not; both now do.
- ~~**`tournaments` has no `last_update` column.**~~ Out of date — the column was added
  on 2026-08-10, before this phase began. The change key is the greatest stamp across the
  tournament **and** its divisions, so a schedule edit is covered, which
  `max(divisions.last_update)` would not have been.
- ~~Interacts with the logout bug in Phase 1.~~ The cache is keyed on the session and
  cleared on logout — but that is the second line of defence, not the first. The ETag
  covers the viewer, so the server will not revalidate one session's copy for another
  even if the client offers it.

## Redesigns

- ~~**Tournament view**~~ — done 2026-08-08.
- ~~**Tournament creation page**~~ — **done 2026-08-11.** It has its own route,
  `/tournaments/create`, rather than a hash-driven section of `Browse`, which is what made
  the post-creation redirect appear to do nothing. The page carries tournament details and
  a list of division summary cards; division configuration happens in a modal that runs
  Basics → Configuration → Teams, skipping the middle screen for a format that has nothing
  to configure. A review modal previews the tournament before anything is persisted, and
  the whole form autosaves to a versioned `localStorage` draft that survives a refresh and
  is cleared only on a successful creation.

  Two things the specification asked for were deliberately not built: the review's format
  preview is an **illustrative schematic** rather than a real generated bracket, and Single
  Elimination is not offered at all, because `generateDivisionDetails` throws
  `FORMAT_NOT_IMPLEMENTED` for it.

## Found in testing, 2026-08-11

Five independent pieces. Grouped as decided on the day; none blocks another.

### Schedule: dates and the grid

**Complete 2026-08-13.** One handover, because the two were entangled in the same screen.
They were unrelated in cause.

- ~~**The date conversion bug**~~ — **done 2026-08-13.** A `pg` type parser for the `date`
  OID (1082) in `api/src/config/db.js` hands `tournaments.start_date` and `end_date`
  through as the stored `'YYYY-MM-DD'` string, so there is no instant for two helpers to
  render differently. `getISODate` and `scheduleValidator.toIsoDate` both take that string
  and reject anything else. `timestamp` is untouched, confirmed against the running
  server. `test/unit/utils/scheduleDates.test.js` is the one test file that sets a non-UTC
  timezone deliberately — the rest of the suite is pinned to UTC and was blind here.
- ~~**The grid renders entries wrongly**~~ — **done 2026-08-13.** Every symptom came from
  one decision: `buildGridRowTimes` added each entry's own start and end as extra row
  boundaries, and `getDayBounds` widened the day to contain its entries, so the axis was a
  function of its own contents. Both are now functions of the settings alone, the rows are
  uniform `slotMinutes` apart at a fixed height, and an entry is positioned by minutes
  through `getEntryRowPlacement` rather than by looking its times up in the row list.
  Occupancy comes from the same placement, so a cell that looks occupied is occupied. An
  unaligned entry is drawn across the slots it covers and marked as approximate; one
  outside the day's hours is listed beneath the grid with its reason, alongside the
  existing court-no-longer-exists case. `locateEntry`'s `placeable` handling from Phase 4
  is kept.
- ~~**Whether the generator needs rework**~~ — **it does not, confirmed 2026-08-13.**
  Audited against a two-division, three-court, two-day tournament — 18 fixtures, pool play
  plus semifinals and finals in each division. All four assertions hold in the produced
  payload: no court holds two entries at overlapping times, no team plays two matches at
  once, each division's pool fixtures end before its first knockout fixture starts
  (div-1's pool closes at 16:00 and its first semifinal starts at 16:00; div-2's knockout
  moves to the second day), and two runs over the same input produce an identical
  schedule. Every fixture was placed. The symptoms were the two faults above.

  That answered the correctness question and not the quality one — the generator placed
  fixtures legally and chose between the legal options badly. That is the rewrite below,
  which was already scoped separately on the same day.

### Schedule generator rewrite

**Complete 2026-08-13.** The generator placed fixtures correctly but chose badly, because
its objectives were never decided — they emerged from weights that did not compose. Court
affinity was `+180` against earliness at `-2` per slot index, so ninety slots of delay
cost exactly one affinity bonus; and that index counted the *filtered available* slots, so
the same slot scored differently on every iteration.

The weighted score is gone. In its place: five hard constraints that a slot either
satisfies or is not a candidate for, and a lexicographic comparison over four objectives
in a stated order. Both are written down in `docs/schedule.md` under Generation
objectives, which is the durable record and what future changes are judged against.

- **Rest is now a hard constraint**, not a score a slot could outbid — one slot between a
  team's two matches on a day, checked in both directions because fixtures are not placed
  in time order. Recorded in `docs/tournament-rules.md`.
- **Under capacity, fixtures are left unplaced and the warning names the constraint.**
  "N fixtures could not be scheduled with the available capacity" was often simply wrong;
  it now distinguishes the court being busy, the teams being busy, the round barrier, and
  the rest minimum, each with what to do about it. An organiser told "capacity" when the
  blocker was rest would add a court that does not help.
- **Unbound knockout teams constrain nothing**, matching the server's treatment of a null
  `team_1`. This mattered only once team exclusivity became hard: two semifinals both
  waiting on `Rank 1` would otherwise never have run at once.

Judged on a two-division, three-court tournament — 20 fixtures, full round robins plus
semifinals, bronze and final, knockout teams unbound as the API really sends them:

| | new | old |
|---|---|---|
| finish time | **15:00** | 18:00 |
| division changeovers | **1** | 3 |
| fixtures placed | 20 of 20 | 20 of 20 |

No court double-booked, no team in two places, no back-to-back match, each division's pool
play finished before its knockout started, and two runs identical. The produced payload
was fed to `api/src/utils/scheduleValidator.js` directly and accepted. Under-provisioned —
one court, a three-hour day — it reported two fixtures blocked by the rest minimum and
twelve by capacity, as two separate warnings.

Two things the rewrite decided against, both recorded in `docs/known-limitations.md`: no
backtracking, and no attempt to give rest across the pool-to-knockout boundary, where the
teams are not yet known.

One departure from the handover worth knowing: **the second objective, "maximise rest
beyond the hard minimum", is not a comparison.** Two candidate slots are only ever
compared when they share an instant, and two slots at one instant give a team the same
rest whichever court they are on — so a comparison there is a branch no input can reach.
The objective is met by the hard floor plus the first objective, and the code says so at
the point where the comparison would have gone. If the first objective ever stops being
the slot's instant, it has to come back.

### Standings

**Complete 2026-08-17.**

- **Points for and against are in the default table.** They were already tracked as
  `pointsFor` and `pointsAgainst`; this was a display change with no server work.
- **Set-score outcome columns are in the advanced view** — how many times a team won 2-0,
  2-1, and so on. `standings.js` now records a `setOutcomes` map per row, keyed by the
  scoreline from that team's perspective. It is a counter, not a tiebreak: the ranking
  chain is unchanged and `docs/tournament-rules.md` says so explicitly. **Derived per
  division**, decided 2026-08-11 — the columns are the union of the scorelines the
  division's fixtures actually produced, ordered best to worst, so a best-of-five division
  shows six and a division with nothing completed shows none. Rounds still have no
  match-format key. See `docs/division-state.md`.
- **The mobile table's sticky columns no longer leak.** Two independent faults, and either
  one alone left the table wrong. The offset was a guess: `.tv-col-rank` declared 44px and
  `.tv-col-team` stuck at a hard-coded `left: 44px`, but under the default
  `table-layout: auto` a declared cell width is only a suggestion, so a rank column that
  rendered wider put the team column over it and one that rendered narrower opened a gap
  for the scrolling cells. The table is now `table-layout: fixed`, every column declares a
  width, and one custom property drives both the rank width and the team offset. Second,
  the sticky cells had no `z-index`, so paint order fell back to DOM order and every
  numeric cell — all of which come after the team cell in the row — painted over them.
  They now carry a small local stacking value, deliberately not one of the `--z-*` page
  layers.

### The knockout bracket is cramped

**Complete 2026-08-17.** `.tv-bracket-slot` went from 84px to 120px (106px below 768px)
and the match card gained internal padding. The room comes from the slot, never from a
`gap` on `.tv-bracket-round-body`: the connector geometry depends on every slot's centre
sitting at its proportional share of the column height, and a uniform gap takes a
different share in a round of eight than in a round of four, so the lines would go on
drawing while quietly ceasing to meet the matches they point at.

### Mobile, application-wide

**Complete 2026-08-16.** Delivered as spacing and stacking scales first, then the mobile
tuning and the schedule maker on top of them.

- **A spacing scale.** `--space-1` to `--space-7` on a 4px base, numbered by position
  because a `max-width: 768px` block redefines the top four for mobile. 520 hardcoded
  declarations across the three stylesheets were snapped onto it, preferring the smaller
  step on a tie — which is what removed the whitespace. The mobile tuning is now seven
  numbers in one block.
- **A stacking scale.** Fourteen z-index values across fifteen orders of magnitude became
  ten named layers. Tabulated in `docs/architecture.md`.
- **`ScoreUpdateModal` and `NextRoundModal` are no longer clipped** by the header and the
  footer. Both are portalled; the fault is recorded as fixed in
  `docs/known-limitations.md`.
- **The schedule maker has its own stylesheet**, `styles/schedule-maker.css`, which ships
  in the modal's lazy chunk rather than the main bundle.
- **The schedule maker switches panels below 900px** instead of stacking them, and the
  grid is the fourth sanctioned scroller.

Two follow-up faults on the schedule maker were found and fixed on 2026-08-16:

- **The switcher took the modal's flexible row.** `.schedule-maker-modal` had three tracks
  and, once the switcher existed, four children below 900px. The switcher landed on
  `minmax(0, 1fr)` and the layout was pushed into an implicit row and clipped — three
  enormous pills on a tablet, and on a phone a collapsed row that read as the switcher
  being missing. The 900px block now declares four tracks and names the child count.
- **The print export roots covered the screen on narrow viewports.** They were hidden by
  `left: -200vw` with `width: 1200px` — a viewport-relative offset against an absolute
  width, so below about 600px a 1200px fixed element reached back across the screen and
  painted over the modal. The off-screen hack was a requirement of the old `html2canvas`
  export and outlived it; the roots are now `display: none`. The print block also has to
  name the switcher explicitly, because its media query is evaluated against the print
  viewport and A4 portrait is under 900px.

**The schedule maker's chrome and usability, complete 2026-08-16.** The chrome took
400–470px of a 667px phone viewport and grew with the number of tournament days, two of
its panels could not be scrolled, and a schedule could only be built by generating one
first. Measured at 320, 390 and 768 on a six-day, three-court tournament, the chrome is
now **186px** and the board gets 72% of the viewport.

- **Print moved into the toolbar** and the header is one row at every width — kicker and
  subtitle hidden below 768px, title truncating. The header keeps only the close button.
- **The day selector moved into the board panel** at every width, as a single
  non-wrapping scrolling strip. It is what stopped the chrome growing with the day count,
  and the Fixtures and Inspector panels no longer carry a control they never used.
- **Secondary actions collapse into an overflow menu below 768px.** Both sets are
  rendered and a media query picks; nothing measures a width, because the development
  pane delivers no resize events. Save and Generate stay visible at every width.
- **The inspector's panels scroll**, with their headings pinned by `position: sticky`.
- **A fixture can be placed from the list**: tap it, tap a free slot. Dragging already
  covered this on desktop and cannot work below 900px, where the list and the board are
  never on screen together. Both directions reuse `handleAssignFixtureToSlot`.
- **Reset** empties the schedule including previously saved entries, behind a
  confirmation that states the counts. It marks dirty rather than saving, so Discard
  undoes it until Save.

The 186px sits above the ~165px the specification aimed at, and that is the floor rather
than slack: a 44px tap target plus the toolbar's own padding makes ~176px the minimum the
three bands can occupy. Nothing is stacking.

Two things this work turned up and deliberately did not fix, both recorded in
`docs/known-limitations.md`: the `App.css` site chrome has tap targets below the 44px
floor, which the tournament view's pass never reached; and `.schedule-maker-launcher*` is
unreferenced, left in place with the rest of the dead classes.

The original statement of the problem follows, for the reasoning.

**Spacing.** Reduce margins and padding across every page so elements can be larger and
less space is wasted. Visual only, no behaviour.

**The schedule maker is unusable on mobile, and spacing is not why.** Three specific
faults, none of which padding will touch:

- **Three panels stack vertically in a viewport-height modal.** At 900px and below
  `.schedule-maker-layout` becomes a single column, so the fixture sidebar, the board and
  the inspector sit one above another, each with `min-height: 280px`. That is 840px of
  minimum content inside a `100vh` modal that has already spent height on a header and a
  toolbar. The board — the thing being worked in — ends up a 280px window, reached by
  scrolling past the other two.
- **The grid has no horizontal scroll.** `.schedule-grid-body` sets `overflow-y: auto` and
  nothing for the x axis, so `96px repeat(courts, minmax(0, 1fr))` squashes each court to
  around 75px on a 320px screen. The entry cards carry team names and a division label and
  become illegible rather than scrollable.
- **No way to focus one panel.** All three compete for the same vertical space at once.

The fix is an interaction change, not a spacing one: on small screens the panels should
become switchable — a segmented control or tabs — so one occupies the screen at a time,
and the grid should get a minimum court width with horizontal scroll.

That last part has precedent. The tournament view already handles wide content on narrow
screens with three sanctioned scrollers, and `docs/architecture.md` records both the
pattern and the audit method — a container with `overflow-x: hidden` turns overflow into
silently clipped content rather than a scrolling page, so check each descendant's right
edge rather than trusting `scrollWidth`. The schedule grid should join that list.

### UI polish, raised 2026-08-16

Seven items. The first four are the Standings and Schedule tabs; the rest are spread.

- ~~**Officials appear wherever a schedule does**~~ — **done 2026-08-17.** `FixtureRow`
  renders them as a conditional line and `ScheduleTab` passes them from the entry; the
  schedule maker's grid and both exports show them too. `docs/tournament-rules.md` was
  corrected at the same time — it had claimed officials were unimplemented.
- ~~**Schedule fixture cards are taller**~~ — **superseded 2026-08-17** by the fixture row
  layout rework, which replaced the aligned-column row with a three-column card and gave
  the content its own room.
- ~~**The score action is an icon**~~ — **done 2026-08-17.** `renderFixtureAction` renders
  `Icon name="edit"` with an `aria-label`, plus a visible label where the row has width for
  it. ~~The status gate is still outstanding~~ — **closed 2026-08-17**, see below.

<!-- superseded, kept for the reasoning -->
- **Officials appear wherever a schedule does.** The field is already captured — the entry
  inspector writes it and the schedule maker's *list* view renders it. Three places ignore
  it: the schedule maker's grid view, the tournament view's Schedule tab, and both print
  exports. `docs/tournament-rules.md` claimed officials were unimplemented; corrected
  2026-08-16.
- **Schedule fixture cards are taller**, so the added information does not crowd.
- ~~**Divisions carry a colour**~~ — **done 2026-08-17.** `DivisionBadge` hashes the
  division id into the four existing accent tokens and sets `--tv-division-color` inline,
  so adding or removing a division does not recolour the rest and a fifth division wraps
  rather than introducing a colour that belongs to nothing else on screen. The badge still
  carries the name; colour is not the only distinguisher. The accents are fills on the
  marketing surfaces, not 0.75rem text on a card — `--tertiary-color` reads at about 1.7:1
  on white — so each theme pushes the accent away from its own background, keeping the hue
  and recovering the contrast. **Still only the badge:** the division pill in
  `DivisionSelector` fills with `--main-color` under white text, and the same hue there
  would need a different derivation to stay legible — the badge's light-theme darkening
  works under white text, its dark-theme lightening does not. Left open deliberately
  rather than shipped at a contrast the rest of the application does not accept.
- ~~**The score action appears only once the tournament is `Ongoing`**~~ — **done
  2026-08-17.** `renderFixtureAction` now takes the tournament's status as well as whether
  the fixture's teams are bound. A `Finished` tournament keeps the action, deliberately and
  said so in a comment: the server accepts a result whatever the status, and a score
  entered wrongly would otherwise have no route to correction once the tournament ended —
  which is exactly when somebody notices.
- ~~**The creation modal's team list keeps a fixed height**~~ — **done 2026-08-17.**
  320px with `overflow-y: auto` above 768px and released below it, where the modal is
  already the whole screen. The scroll to a newly added team is an instant `scrollTop`
  assignment and fires only on growth, so removing a team leaves the view where the
  organiser left it. Measured: sixteen teams, 796px of rows in a 320px window, modal 673px
  in a 910px viewport.
- ~~**The creation review shows the real bracket and groups teams by pool**~~ — **done
  2026-08-17.** `components/create/divisionPreview.js` is the port: `poolMembership`
  mirrors `populateGroups`, `knockoutRounds` mirrors `createClassicState`'s knockout loop
  in rank indices, and `previewBracket` shapes them the way `buildDivisionBracket` does so
  `BracketView` is fed rather than copied. The illustrative caption is gone — the preview
  is a claim now — and the review's flat team list went with it, because every team appears
  inside its pool. A Round Robin division says it has no knockout instead of drawing an
  empty bracket.

  **The pin is `shared/division-structure.json`**, the condition `docs/decisions.md`
  attached to accepting the duplication. Six pool cases and seven qualifier counts, with
  membership, round names, match counts and rank pairings. `api/test/unit/services/
  divisionStructure.test.js` asserts the server produces them; `tourganiser-ui/test/
  divisionPreview.test.js` asserts the client does. Neither imports the other's code, and
  both were checked by breaking one side's arithmetic and confirming only that side's suite
  went red.
- ~~**Teams can be reordered by dragging**~~ — **done 2026-08-17**, in the creation modal
  and the Teams tab. HTML5 drag and drop, following the schedule maker; no library. Both
  lists carry a handle rather than a draggable row, because both rows hold controls that
  dragging would fight with, and the handle is a real button that also moves its row on
  ArrowUp/ArrowDown — so the order is not a pointer-only fact. The creation modal's rows
  were keyed by array index and now carry a stable local key; without that React reuses an
  element positionally and one team's input ends up holding another's text.

  ~~`PUT /api/divisions/:divisionId` cannot express a reorder~~ — **closed 2026-08-17.**
  `sameSet` now splits three ways: same order is the unchanged rename, a different order is
  a reorder, and a different set is the unchanged rebuild. A reorder writes `state.teams`
  through `divisionsRepository.updateTeamOrder` — a `jsonb_set` on that one key, which
  stamps `last_update` itself — applies any name changes in the same transaction, and
  leaves `state.rounds` alone, because pool groups hold team ids and knockout groups hold
  rank indices. Gated on `Not Started` and nothing else: a reorder destroys nothing, so
  there is no second condition for the status check to be wrong about.

  **Revised 2026-08-28: a reorder now redraws pools and regenerates fixtures**, using the
  same `buildDivision`/`replaceState`/`createFixtures`/`repairSchedule` path a rebuild uses,
  because seed order is what the pool draw runs on and leaving pools untouched left the
  organiser's actual intent unmet. `updateTeamOrder` is no longer called from this path.
  Gained the rebuild's `DIVISION_HAS_RESULTS` gate alongside `Not Started`, since it now
  destroys and regenerates fixtures too. See `docs/decisions.md`, "Seeding May Only Be
  Reordered Before A Tournament Starts".

### ~~Client cache survives a refresh~~ — closed 2026-08-17

The `{ etag, payload }` store moved from a module-level `Map` to `sessionStorage`: keyed on
the viewer as well as the tournament, bounded to three tournaments, and read through the
same guards as the creation draft, so a corrupted or unavailable store costs the cache and
not the page. `clearTournamentCache` now runs inside `AuthProvider`'s `setIsLoggedIn`,
which is the one place logout, login and signup all reach. `docs/decisions.md` records it.

## Improvements raised 2026-08-17

Twelve items in four groups. Decisions taken on the day are in `docs/decisions.md`; the
two that change domain rules also require `docs/tournament-rules.md` to be corrected when
the code lands.

### Knockout correctness

All four are done, 2026-08-17. `docs/tournament-rules.md` carries the corrected rules and
the three limitations they closed are out of `docs/known-limitations.md`.

- ~~**Crossovers after the first round pair the wrong teams.**~~ — **done 2026-08-17.**
  The sort by seed is out of `seedKnockoutResults`, so match order survives and the winner
  of QF1 meets the winner of QF4.
- ~~**Qualifiers are ordered by pool within a tier**~~ — **done 2026-08-17.** Pool A's
  winner first, then pool B's; cross-pool statistics decide only the places a tier cannot
  fill cleanly. The qualifier count is derived from the next round's `groups` rather than
  read from a key that was never written, and a knockout round's `results` now carry its
  bye teams — a Round of 12 advances the right eight.
- ~~**The bracket payload carries its feed links**~~ — **done 2026-08-17.** Each match
  carries a `sources` array parallel to its participants, so later rounds are labelled
  "Winner of #31" rather than repeating rank placeholders and the connectors are drawn
  from what the server declares instead of from match counts.
- ~~**Final rankings get their own tab**~~ — **done 2026-08-17**, beside Pool/League and
  Knockout. A round-robin division fills once at the end; a division with knockout rounds
  fills from the bottom after each round, so places five and below are known before the
  final. Teams knocked out in the same round are separated by their performance in the
  match they lost, then by earlier rounds, then by seeding.

### Lifecycle controls

Both are done, 2026-08-17.

- ~~**Add and remove divisions from the Overview tab**~~ — **done 2026-08-17**, organiser
  only, while `Not Started`. `POST /api/tournaments/:tournamentId/divisions` fills the
  route stub that used to hang and goes through `divisionService.createDivision`, so an
  added division is indistinguishable from one created with the tournament. `DELETE
  /api/divisions/:divisionId` cascades to the division's teams and fixtures and repairs the
  schedule in the same transaction rather than nulling it, per `docs/decisions.md`; the
  last division is refused with `LAST_DIVISION`. Adding reuses the creation modal, imported
  from `components/create/`.
- ~~**Hide controls that cannot be used**~~ — **done 2026-08-17.** `isNotStarted` in
  `components/tournament/tournamentStatus.js` is the one rule, and Add Team, Edit, Remove,
  the reorder handles, Add Division and Remove Division are all absent once the tournament
  has started. The note explaining why reordering was unavailable went with them. Start
  Tournament now confirms first, naming both what locks and what does not. **The schedule
  stays editable after the start** — tournaments overrun, and it is the organiser's main
  tool. Every server check stayed; hiding is presentation, the 409s are the enforcement.

### Schedule maker

- ~~**Courts can be assigned to divisions**~~ — **done 2026-08-22.** Stored on each court
  as a `divisions` array so the constraint survives a reload, the generator honours it on
  every run (a hard constraint), and the validator enforces it on write
  (`SCHEDULE_COURT_DIVISION`). Unassigned courts behave as before. See `docs/schedule.md`.
- ~~**Courts can be removed**~~ — **done 2026-08-22.** The overview panel has a remove
  control per court; removal never regenerates the list, so surviving courts keep their
  ids and entries, and a removed court's entries resurface below the grid.
- ~~**Officials can be auto-assigned**~~ — **done 2026-08-22.** Behind a toggle in the
  generation settings, off by default. One team per match, assigned after placement. A team
  never officiates a match overlapping its own and never one outside its division — both
  hard, the second also enforced by the validator. Prefers not to officiate immediately
  before its own game, prefers its own pool, and spreads the load across the division. A
  match with no eligible team is left blank and counted in the warnings.

### Smaller UI

- ~~**Fixture groups collapse.**~~ — **done 2026-08-22.** By day when a schedule exists, by
  status otherwise — Live, Upcoming, Completed, then Cancelled last. A shared
  `FixtureGroup` component carries the show/hide control, no surrounding borders, everything
  expanded on load; empty status groups are omitted.
- ~~**`ScoreUpdateModal` shows progress.**~~ — **done 2026-08-22.** Clicking Save disables
  both Save and End Match and shows a spinner inside Save; End Match likewise. Add Set and
  Back stay live. The spinner is scoped to the two buttons and tracks each one's text colour.
- ~~**Team names get a frontend soft cap**~~ — **done 2026-08-22**, at `TEAM_NAME_MAX` on
  the Teams tab's add and rename form, and the Overview's up-next and recent-results rows
  give both team names an equal capped share so one long name stops truncating the short one
  beside it.

## Phase 6 — Decide what is real

Each of these is currently a stub with no schema behind it. Either it enters the roadmap
properly or the stub is removed.

- ~~**Friends**~~ — **removed, decided 2026-08-11.** No table, no UI beyond an inert menu
  item, and it was really a step towards letting someone other than the organiser update a
  tournament — which is now the editors-and-scorers entry in `docs/future-features.md`, and
  a better shape for the need. Deleting `addFriend` and `getFriends` from
  `users.repository.js`, the menu item, and known bug 10's cases for them empties
  `npm run test:bugs`, which has never been green. The saved-tournament functions in bug 10
  stay until the Profile page uses them.
- ~~**Profile and Saved Tournaments**~~ — **done 2026-08-23.** `GET /api/users/profile`
  (self-scoped, no `:id`), `GET /api/users/profile/tournaments` and
  `GET /api/users/profile/saved-tournaments`, plus real `POST`/`DELETE
  /api/tournaments/:tournamentId/save`. `Profile.jsx` replaces the `/profile`
  placeholder: a read-only account panel, a Created Tournaments list and a Saved
  Tournaments list with a remove control, both reusing `TournamentCard`.
- Live scoring, officials assignment, configurable ranking basis, and the rest of
  `docs/future-features.md`.
