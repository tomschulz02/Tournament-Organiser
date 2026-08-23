# Architectural Decisions

## JSONB Division State

Reason:
Tournament structures are dynamic.

## Fixtures Separate From Division State

Reason:
Fixtures are reusable entities referenced by ID.

## Scheduling Separate From Fixture Generation

Reason:
Schedules should be regenerated independently of fixtures.

## Raw pg

Reason:
Maintain direct SQL control and avoid unnecessary abstraction.

## The Server Has Authority Over Tournament State

Decided 2026-08-08.

The test: **if the client and the server disagreed about a value, would the stored
tournament be wrong? If yes, the server owns it.**

Server-owned, regardless of what it costs in payload or response time:

- standings, rankings and qualifiers
- match outcomes derived from set scores
- round completion and progression
- tournament and fixture status transitions
- fixture generation
- team membership of a division (`state.teams`)
- anything written to `divisions.state`, which is validated on write

Client-owned, because it is derived from data the client already holds and is then
discarded:

- sorting, filtering, tab and expand state
- date, ratio and status formatting
- search over an already-fetched list
- optimistic and pending UI states

The client may propose. It may not decide. `progression.service.js` is the reference
implementation: `getProposal` computes a default, the organiser may amend it, and
`commit` revalidates the amended list from scratch rather than trusting the proposal it
issued. Client-side validation is encouraged as user experience and is never the only
check.

Reason:
Two authorities over the same state means the tournament record can disagree with what
the organiser was shown, and there is no way to tell which is right after the fact.

### Corollary: reducing payload does not license moving authority

Where response time matters, scope and cache before relocating computation. Narrowing
what an endpoint returns, and using `divisions.last_update` for conditional requests,
both cut cost without moving a rule to the client. Computation moves to the client only
when its output is genuinely ephemeral.

## Schedule Generation Runs In The Client; The Server Validates

Decided 2026-08-08. Supersedes the earlier intention, recorded in
`docs/architecture.md`, to move the generator to a backend service.

Generating a schedule is a proposal, not a commitment — the organiser edits it before it
is saved. It can therefore run in the client without breaching the decision above, so
long as the server validates before writing. This keeps generation off the server and
avoids a round trip per regeneration.

The line: **the server rejects schedules that are impossible; the client is responsible
for schedules that are good.**

Impossible, rejected by the server on write:

- a fixture id not belonging to the tournament, or appearing twice
- two fixtures on the same court in overlapping slots
- one team required in two places at once
- slots outside the tournament's start and end dates, or ending before they start
- a knockout fixture scheduled before the round that feeds it

Good, and none of the server's concern: court balance, rest time between a team's
matches, minimising gaps, court preferences, how days are packed. These are the
generator's heuristics and the organiser's judgement.

Partial schedules are legal. Not every fixture has to be placed.

Reason:
The validator only has to detect impossibility, which is a far smaller job than
generation. That keeps the duplication between the two tiers small enough that no shared
module is needed.

Built 2026-08-10. `api/src/utils/scheduleValidator.js` enforces the list above on
`PUT /api/tournaments/:tournamentId/schedule`, one error code per rule so the organiser
is told which one they broke. `docs/schedule.md` is the payload contract it validates
against, and `docs/api.md` lists the rejections.

The two tiers stayed separate as intended: the client's `validateScheduleEntry` checks
one entry against what the browser holds, the server checks the whole schedule against
the fixtures it can see, and neither imports the other.

## A Schedule Belongs To The Tournament, Not To A Division

Decided 2026-08-08. The schedule moved from `divisions.schedule` to
`tournaments.schedule`, and `updateSchedule` moved from the divisions repository to the
tournament repository with it.

Divisions of one tournament share the same physical courts. Two divisions scheduled
independently can therefore place two matches on one court at one time, and neither
schedule is wrong on its own — the conflict only exists between them. A per-division
column made that state representable, and made "two fixtures on the same court in
overlapping slots" a rule no single write could check.

One schedule over the whole fixture set makes the conflict impossible to express rather
than merely invalid, which is the stronger of the two. It also matches how an organiser
thinks about a tournament day: one timetable, several divisions running through it.

The copy of the schedule that older code kept inside `divisions.state` is gone too. It
predated the dedicated column and was only ever read as a fallback.

## Typed Errors With A Central Handler

Decided 2026-08-08. The full contract is in `docs/api.md`.

Repositories previously threw in some functions and returned an error string from the
catch in others. That was not a disagreement between two positions; it was two
half-finished attempts made before the approach had been decided. This is the decision.

Failures are of exactly two kinds. **Expected domain failures** are part of the API
contract and carry a code, a status and a client-safe message. **Unexpected faults** are
everything else and are all 500s with a fixed generic message, with the detail logged
rather than returned.

Repositories always throw and never return an error string, wrapping the underlying
error as `cause` so the Postgres code survives. Services translate expected conditions
into a thrown `AppError` naming a condition, not a status. Controllers do not catch at
all — Express 5 forwards async rejections on its own. One error middleware maps, builds
the envelope and logs.

Code, status and user-facing message are declared together in a single catalogue,
`api/src/errors.js`. An unrecognised code is a 500.

Reason:
Keeping HTTP out of services is what `docs/architecture.md` already requires, and a
single catalogue means the wording of every user-facing failure lives in one auditable
file rather than being reinvented per controller. Preserving `cause` is what makes it
possible to turn a unique-constraint violation into a 409 that says the email is already
registered, instead of the 500 it currently produces.

## Creating A Tournament Is One Transaction

Decided 2026-08-08.

The whole creation path — the tournament row, every division, every team, every fixture —
runs on a single client inside a single transaction. A `withTransaction(fn)` helper in
`api/src/config/db.js` owns `BEGIN`, `COMMIT`, `ROLLBACK` and releasing the client. The
service chooses the boundary; repositories keep owning the SQL.

This replaces one transaction per division plus a compensating `deleteTournament` that
relied on foreign-key cascade to clean up after a partial failure.

Reason:
The compensating delete is a hand-written undo of something the database does for free,
and it can fail on its own account, leaving orphans that nothing records as orphans. It
also cannot cover its most important case: if the tournament insert is what failed, the
id is still its initial `0` and the cleanup throws an invalid-uuid error over the top of
the real error. A transaction cannot half-succeed, so the whole class disappears. It also
closes a window in which a concurrent read could see a tournament with no divisions.

Consequence: parallel work inside the transaction becomes sequential, because one pg
client cannot run concurrent queries. Nothing is lost — the previous `Promise.all` over
divisions opened a connection each and contended for the same pool.

## Changing A Division's Teams Regenerates Its Structure

Decided 2026-08-09. Replaces the superseded decision below.

Teams may only be changed while the tournament has not started, so nothing that is
regenerated has ever held a result. The gate is `tournaments.status === 'Not Started'`,
with a second check that no fixture in the division is `COMPLETED` — one extra query,
and it protects against a status that is simply wrong.

**Two kinds of change, and the server tells them apart from the data rather than being
told.** The client sends the division's full intended team list; the service compares the
incoming ids against `state.teams`:

- **The set is unchanged** — only names differ. Update `teams.name` and stop. No
  regeneration, no fixture changes, no schedule impact. Renaming is nearly free because
  fixtures reference `teams.id`, `state.teams` holds ids, and the schedule references
  fixture ids. Nothing structural depends on a name.
- **The set differs** — a team was added or removed. The division's structure is rebuilt.

Rebuilding means: delete every fixture in the division, regenerate `state.rounds` through
`generateDivisionDetails` for the new team count, regenerate fixtures through
`generateFixtures`, and write the new ordered `state.teams`.

**Team count is a structural parameter, not a list length.** In a Classic division,
`num_groups` and `knockout_teams` were chosen against a specific count — going from eight
teams to seven turns two pools of four into a four and a three, and may change what the
knockout stage should be. So the organiser **confirms group count and qualifier count as
part of the change**, defaulted to their current values and validated against the new
count. They are never silently recomputed.

**Edits batch.** The team list is edited client-side and committed once, so the structural
confirmation happens a single time at commit rather than on every keystroke.

**The schedule is repaired, not discarded.** A schedule spans the tournament, so
regenerating one division's fixtures must remove that division's entries from
`tournaments.schedule` and leave every other division's placements intact. Nulling the
column would throw away scheduling work that has nothing to do with the change.

Reason:
A team withdrawing a week before a tournament is ordinary. The alternative considered was
to allow renaming only and require the organiser to delete and rebuild the whole division
to change its size — but that is still delete-and-regenerate, only manual, lossier, and
paid for by the user re-typing every remaining team. Adding and removing divisions
remains available as its own capability, for organisers who genuinely want another age
group; it is not the workaround for a withdrawn team.

Consequence: the three 501 team stubs are superseded by one endpoint that replaces a
division's teams and structure together, because the two cannot be changed independently.

Built 2026-08-10 as `PUT /api/divisions/:divisionId`; the three stubs, their routes and
their client request functions are gone. Two details settled during the build:

- **A submitted team id must already belong to the division.** Anything else is refused
  with `TEAM_NOT_IN_DIVISION` rather than reinterpreted as a new team, so a request
  cannot reach into another division's teams.
- **`num_groups` and `knockout_teams` are required on a rebuild**, not defaulted. A
  client that forgets to send `num_groups` would otherwise silently collapse a
  two-pool division into one, which is exactly the silent recomputation this decision
  rules out.

## ~~Teams Are Selected Or Created, Never Duplicated~~ — SUPERSEDED

**Reversed 2026-08-09.** The schema is now `teams (id, name, division_id)` with no
`user_id`. A team belongs to one division, so there is no library of a user's teams to
select from and nothing to link by id — every team is created with its division. The
reasoning below is kept because it records what was given up: a team can no longer be
followed across tournaments, which forecloses cross-tournament statistics unless a
separate club or team-identity concept is introduced later.

Closed 2026-08-09: `teams.division_id` and `state.teams` both express membership, and
`docs/division-state.md` records which owns what — `state.teams` for order,
`division_id` for the foreign key. The code came down to the schema the same day;
`TEAM_NOT_OWNED` is gone, as there is no longer a client-supplied team id to authorise.

The superseded decision follows.

Decided 2026-08-08.

A team in the creation payload is either an existing team, carrying `id`, or a new one,
carrying `name` only. Existing teams are linked as they are; new names are inserted with
`user_id` set to the organiser and the resulting id is what lands in `state.teams`. State
holds ids and nothing else, unchanged.

An id supplied by the client is untrusted. It must be confirmed to belong to the
organiser before being linked, or one user can attach another user's team to their
division.

`getTeamNames` is repurposed to `getTeamsByUserId`, listing the teams a user owns, which
is what populates the selection dropdown. It is exposed as `GET /api/teams`, scoped to
the authenticated caller.

Reason:
Teams outlive a single tournament — the same club side enters repeatedly — and
re-creating a row per entry would scatter one team's history across many ids and make
cross-tournament statistics impossible later. This is also what `teams.user_id` is for.

## REST Paths, And Collections Removed

Decided 2026-08-08. The convention and the full endpoint list are in `docs/api.md`.

Paths are resource-oriented: nouns only, plural collections, the HTTP method carrying
intent for CRUD, and genuine actions expressed as sub-resources —
`POST /api/tournaments/:tournamentId/start` rather than
`POST /api/tournaments/start/:tournamentId`. Path parameters name their resource, so
`:tournamentId` rather than `:id`.

Start and end are deliberately sub-resources rather than a `PATCH { status }`. The
server owns status transitions, and a generic PATCH invites the client to assert one.

**Collections are removed.** The idea was a grouping of related tournaments; it was
replaced by a single tournament holding multiple divisions, which covers the same need.
Nothing referenced the feature — both components were orphaned, both request functions
uncalled, no table, no endpoint — so it is deleted rather than carried.

Reason:
The old paths were inconsistent enough that each new endpoint needed a judgement call.
Settling the convention before Phase 3 builds these avoids renaming across both tiers
afterwards.

## The Creation Review Computes Pools And Rounds In The Client

Decided 2026-08-16. **Reverses the illustrative-schematic decision** taken with the
tournament creation redesign, which held that the review would show a suggestive shape
rather than the real structure.

The review now shows the actual knockout bracket and lists teams grouped by the pool they
will be drawn into. Neither can be faked: pool membership comes from `populateGroups`'
serpentine seeding, and the bracket's round shape from `createClassicState`'s arithmetic.
Both are server code, and nothing is persisted at review time, so the client computes them
itself.

**This deliberately duplicates logic `docs/tournament-rules.md` says must not be
duplicated.** Three options were weighed: a preview endpoint running the real generation
and persisting nothing; porting the arithmetic to the client; or keeping the schematic and
dropping pool grouping. The port was chosen.

What is ported is narrow — pool composition and round shape only. `generateFixtures` stays
on the server; the review never shows individual fixtures.

**The duplication is pinned by a shared expectation fixture.** One file in the repository
lists, for a spread of team, group and qualifier counts, the pool sizes and round names the
rules produce. The API suite asserts the server matches it; the UI suite asserts the client
port matches it. Both import the same file, so neither side can move without its own tests
failing and naming the input that broke.

Reason:
The organiser is committing to a structure they cannot change afterwards without a
rebuild, so the review is the last moment the pools can be checked — and a preview that
cannot show which teams meet in the pool stage does not answer the question being asked of
it. The endpoint was declined; the fixture is what makes the alternative safe.

Given up: a single source of truth for seeding. If the ranking or grouping rules change,
two places must change together, and the fixture is the only thing that will say so.

## Seeding May Only Be Reordered Before A Tournament Starts

Decided 2026-08-16.

`state.teams` order is the seeding, and seeding is the final tiebreak in the ranking chain
— see `docs/tournament-rules.md`. Reordering it after matches have been played would
retroactively change who separated from whom, and therefore who qualified, with nothing on
screen to explain why a standings table had reordered itself.

Reordering is therefore allowed only while `tournaments.status` is `Not Started`, the same
gate team editing already uses. One rule covers both, and there is nothing new to explain.

Note this is stricter than it strictly needs to be: pools hold team ids and knockout groups
hold rank indices, so a reorder disturbs neither, and a correction made after starting but
before any result would be harmless. Consistency with the existing gate was preferred over
that extra permissiveness.

**Consequence: `PUT /api/divisions/:divisionId` cannot currently express a reorder.** Its
`sameSet` test — every entry carrying a known id, and the count matching — is satisfied by
a reordered list, so it routes to `renameTeams`, which writes only changed names and never
touches `state.teams`. A reorder submitted today does nothing at all. Closing that is part
of the work.

## Knockout Progression Follows Match Order, Not Seed

Decided 2026-08-17. **This corrects `docs/tournament-rules.md`**, which currently
documents the behaviour being replaced.

A knockout round's `results` are ordered **by the match each team came from** — winners of
match 1, 2, 3, 4, then losers of match 1, 2, 3, 4 — not re-sorted by the seed they carried
into the round.

The next round folds that list bottom-up, which the existing `populateGroups` call already
does: with four winners the groups are `[[0, 3], [1, 2]]`. Combined with match ordering
that gives the standard bracket — the winner of the first quarter-final meets the winner of
the fourth, and the second meets the third. The bronze match becomes the two semi-final
losers, which is what it should always have been.

`seedKnockoutResults` in `api/src/utils/standings.js` sorts winners and losers by seed.
That sort is the whole of the fault: the matchups already arrive in match order.

Reason:
Re-seeding after every round is a legitimate format, but it is not the one this
application intends. Under it an upset moves the winner into the beaten team's place in the
ranking rather than in the bracket, so a team that beat the top seed inherits the top
seed's *ranking* and can be paired against a team it should not meet until later. A fixed
bracket is what an organiser draws on a wall chart, and it is what the fold implies.

Given up: nothing the application relied on. The documented rule was wrong rather than a
deliberate choice.

## Qualifiers Are Ordered By Pool Within A Tier

Decided 2026-08-17. **This also corrects `docs/tournament-rules.md`.**

Qualification still fills by tier — every pool winner, then every runner-up, and so on,
which is what `seedAcrossGroups` already does. What changes is the order **within** a tier:
by pool, not by stats. Pool A's winner is always the first qualifier, then pool B's, and so
on; then pool A's runner-up, and so on.

Cross-pool statistics decide only the places a tier cannot fill cleanly. With ten
qualifiers from four pools the first eight are the top two from each pool in pool order,
and the remaining two are the best teams not already through, compared across pools by the
existing chain.

The chain still applies **within** a pool. A tie for a qualifying place inside one pool is
resolved exactly as `docs/tournament-rules.md` describes.

Reason:
Pools are themselves seeded serpentine, so pool A already holds the top seed. Ordering
qualifiers by pool keeps the bracket predictable from the draw rather than dependent on
scorelines, and it means an organiser can point at the wall chart before the pools finish
and say which slot each pool winner will take.

Given up: the convention that the strongest qualifier earns the easiest quarter-final.

## The Bracket Payload Carries Its Own Progression

Decided 2026-08-17.

`buildDivisionBracket` includes, for each match, which matches feed it. The bracket stops
being inferred.

This closes a limitation recorded in `docs/known-limitations.md`: nothing in the payload
said which match fed which, so `BracketView` guessed from match counts and drew connectors
only where a round held exactly twice the matches of the next. An uneven round — a
`Round of 9` holding one real match because seven teams had byes — drew no lines at all.

It also lets the client label later rounds "Winner of #31" instead of repeating the rank
placeholders, which only apply to the first knockout round. Match numbers are shown in the
bracket for the same reason.

Reason:
The alternative was a third client-side copy of structural arithmetic, after
`populateGroups` and the round shapes. The server already knows the answer; saying it is
cheaper than deriving it, and it removes an inference that was already producing visibly
wrong output.

## Ownership Is Checked In The Service, Not In Middleware

Decided 2026-08-08.

Two layers, with different jobs. `requireAuth` middleware proves **identity** — that a
valid session exists, so `req.user.id` can be trusted. The service proves **permission** —
that this user owns the tournament being acted on. Middleware cannot do the second
without duplicating work.

Rules:

- Every service function that mutates tournament data takes `userId` as a **required**
  parameter. Not optional, not read from a context. A required parameter cannot be
  omitted silently; skipping the check means passing an argument and ignoring it, which
  is visible in review. This is what replaces the auditability that a route-level guard
  would have provided.
- The ownership check rides along with a fetch the service already needed. Three
  resolvers, one per entry point, each returning the row plus the owner:
  `getDivisionWithOwner` for a division id (exists); an equivalent joining fixtures →
  divisions → tournaments for a fixture id; and `created_by` straight from
  `getTournamentById` for a tournament id.
- A mismatch throws `NOT_TOURNAMENT_OWNER`, which the catalogue maps to 403.
- Ownership guards organiser-only **reads** as well as writes. `GET /progression`
  already requires it, because the proposal is not public information. Which endpoints
  need it is recorded per-endpoint in `docs/api.md`, not inferred from the HTTP verb.

`progression.service.js` `loadDivision` is the reference implementation.

Reason:
Route middleware would fetch the row to authorise, then the service would fetch it again
to work with. Every mutation starts from a different resource — a fixture id, a division
id, a tournament id — so a single guard would need its own lookup per type and would
still not save the service any work.

### Corollary: existence is not secret

`loadDivision` throws `DIVISION_NOT_FOUND` before `NOT_TOURNAMENT_OWNER`, so a non-owner
learns that a division exists. That is deliberate and should not be "hardened".
Tournaments are publicly browsable, so their existence is already public.

### Open: admin override

The JWT carries an `admin` claim and nothing reads it. Whether an admin bypasses the
ownership check is undecided. Until it is, `admin` grants nothing.

## One Fixture Status Vocabulary, Derived By The Server

Decided 2026-08-08.

The values are the `fixture_status` enum in `docs/database.md`: `UPCOMING`, `LIVE`,
`COMPLETED`, `CANCELLED`. They travel unchanged from the database to the React
component. `WAITING` and `ONGOING` are removed.

`tournamentViewFormatter.js` currently translates the enum into `WAITING`/`ONGOING` on
the way out, and the old tournament view translated it back with a `statusMap` in order to
display it. Both translations go.

**Status values and display labels are different things.** Showing a user "In progress"
is a presentation choice and belongs in the component. A second vocabulary in the
payload is not, and was the direct cause of known bug 5 — `hasPlayedFixtures` tests for
`LIVE` while the formatter emits `ONGOING`, so a round already under way is not
detected. Removing the translation fixes it.

Status is **derived by the server, then stored**:

| Status | Meaning |
|---|---|
| `UPCOMING` | No set scores recorded. |
| `LIVE` | At least one set recorded, and the organiser has not ended the match. |
| `COMPLETED` | The organiser has ended the match. |
| `CANCELLED` | The organiser cancelled it. The match never happened. |

Only `CANCELLED` is a genuine manual flag. The rest follow from the score data, so the
client never sends a status — it sends scores and an intent. `updateScore` therefore
narrows to `(fixtureId, sets, finished)`; `status`, `hashId` and `rounds` are removed
from the payload.

Because the write that sets `COMPLETED` is the only thing that can complete a fixture,
the same transaction maintains `round.completedGames`, which nothing currently does.

Reason:
Two vocabularies for one concept meant every consumer had to know which side of the
translation it was on, and one of them got it wrong. Deriving the status server-side
follows from the server having authority over tournament state; a status the client
asserts is a status the client can get wrong.

Known dependency: the server cannot fully derive `COMPLETED` yet. A match ends when a
team wins `ceil(N/2)` sets, and round objects have no match-format key — see
`docs/division-state.md`. Until they do, the organiser signals the end of a match
explicitly. When per-round best-of lands, that signal becomes a confirmation rather than
the source of truth and nothing else changes.

This does not foreclose live scoring. `LIVE` already means in progress; live scoring is
more frequent writes to the same fields.

### Corollary: the response envelope has exactly three keys

`success`, `message`, `data`. `message` is display-ready — the client can pass it
straight to `showMessage`. There is no machine-readable error code in the envelope; the
HTTP status carries that, and the client's `request` helper preserves it on the thrown
`ApiError` rather than discarding it as `fetchWithRetry` did. If two conditions ever need
distinguishing within one status, a code goes inside `data` at that point.

## The Tournament Payload Is Cached In `sessionStorage`, By The Application

`GET /api/tournaments/:tournamentId` is the one cached response. `requests.js` stores
`{ etag, payload }` per tournament, sends the stored validator as `If-None-Match`, and
serves the stored body when the server answers 304. Three tournaments are kept, most
recent first, and the viewer is part of the storage key.

**`sessionStorage`, not `localStorage`.** The original decision rejected `localStorage`
because *a stale organiser payload surviving a browser restart is worse than no cache at
all*. That objection is about persistence across restarts, not persistence as such.
`sessionStorage` is scoped to the tab and cleared when it closes, so it survives the reload
the cache exists for and nothing beyond it. It meets the objection rather than overriding
it. A module-level `Map` came first and was emptied by every reload — page state cannot
cache across a page load. Moved 2026-08-17.

**The application holds the cache, not the browser.** `Cache-Control: no-cache` would let
the browser's own HTTP cache do much the same job invisibly. It is not left to, for one
reason: the browser's cache cannot be cleared from JavaScript, and a payload carrying
`creator` has to be droppable on logout. Sending `If-None-Match` from the application also
takes the browser's cache out of the exchange — per the Fetch standard a request carrying a
conditional header is not served from it — so the two cannot disagree about which copy is
current.

Reason:
The payload carries `creator`, so the question a cache of it has to answer is not "is this
current" but "whose is this". Three things answer it, in order: the server's ETag covers
the viewer, so a stale entry can never be revalidated for anyone else; the viewer is in the
storage key, so two viewers cannot collide even in principle; and `clearTournamentCache`
runs wherever `sessionVersion` moves — logout, login and signup all pass through
`setIsLoggedIn` in `AuthProvider`, which is why the clear lives there rather than at the
three call sites. The first is the line that holds. The others exist so that being wrong
about the first is not sufficient.

Storage safety follows `utils/createDraft.js` exactly, and for the same reason: this is
read on the tournament view's first request, so anything that throws there makes the page
unopenable for that browser. `getItem` and `JSON.parse` inside one `try`, a version check
before anything is trusted, guarded writes, a malformed or wrong-version value discarded
without a word, and a quota error discarding rather than throwing. A cache miss is never an
error; a browser with storage disabled loses the cache, not the page.

Known cost: the page still awaits the response before it renders, because
`fetchTournamentData` returns the stored body only once the 304 has come back. What this
buys is the payload, not the round trip. Rendering from storage before the network resolves
would mean `View.jsx` showing a copy it has not had confirmed — a different decision, and
one that puts `creator` on screen on the strength of the cache alone.
