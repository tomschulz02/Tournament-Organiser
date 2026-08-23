# API

Base path: `/api`

Layer responsibilities (Routes → Controllers → Services → Repositories) are defined in
`docs/architecture.md`. This document covers the HTTP contract only.

## Response Format

Every endpoint follows this contract. Implemented throughout on 2026-08-08.

Success:

{
  "success": true,
  "data": <payload or null>,
  "message": "Human readable string"
}

Error:

{
  "success": false,
  "data": null,
  "message": "Human readable string"
}

Rules:

- Exactly three keys. `success`, `message`, `data`. Nothing else, ever.
- `data` carries the payload. Never put payload in `message`.
- `message` is always a string, never an object or array.
- **`message` is display-ready.** The frontend must be able to pass it straight to
  `showMessage` without editing it. It therefore never contains an error code, a SQL
  fragment, a stack, an internal identifier, or anything the user should not see.
- No ad-hoc top-level keys. Anything else the client needs goes inside `data`.
- Always use an appropriate HTTP status code. `success` must agree with it.

`message` being display-ready does not oblige the client to display it. A `GET` that
populates a page should not raise a toast; the message is available, not mandatory.

There is deliberately **no machine-readable error code in the envelope**. The HTTP
status is the machine-readable signal, and it is enough to distinguish the cases the UI
actually branches on. The client's `request` helper preserves it on the thrown
`ApiError`. If a client ever needs to distinguish two conditions that share a status,
add a code inside `data` at that point rather than pre-emptively.

Status codes in use:

- 200 OK — successful read or update
- 201 Created — resource created
- 304 Not Modified — the client's `If-None-Match` matched; no body. Only
  `GET /api/tournaments/:tournamentId` returns it
- 400 Bad Request — validation failure
- 401 Unauthorized — missing or invalid token
- 403 Forbidden — authenticated but not permitted
- 404 Not Found — resource does not exist, or invalid UUID in path
- 409 Conflict — the request is valid but the resource is in a state that forbids it
- 429 Too Many Requests — the auth rate limit was exceeded; only `POST /api/users/login`
  and `POST /api/users/signup` can return it
- 500 Internal Server Error — unexpected failure
- 501 Not Implemented — the route exists but the feature does not yet

## Error Handling

Decided and implemented 2026-08-08. See `docs/decisions.md` for the reasoning.

Two kinds of failure, handled differently:

**Expected domain failures** are part of the contract. "This round is not finished",
"you do not own this tournament", "that team did not play". Each has a stable code, an
HTTP status, and a client-safe message.

**Unexpected faults** are everything else — a dropped connection, an unanticipated
constraint violation, a bug. All become 500 with a fixed generic message. Detail goes to
the log, never to the client.

Responsibilities by layer:

| Layer | Does |
|---|---|
| Repositories | Always throw, never return an error string. Wrap the underlying error as `cause` so the Postgres code and constraint name survive. Assign no HTTP meaning. |
| Services | Translate expected conditions into a thrown `AppError` carrying a code. Name the condition, not the status — HTTP stays out of the business layer. Let anything unexpected propagate untouched. |
| Controllers | Do not catch. Express 5 forwards rejected promises from async handlers to the error middleware automatically. |
| Error middleware | The single place that maps a failure to a status, builds the envelope, and logs. |

The code-to-status-and-message catalogue lives in one file, `api/src/errors.js`. A code
with no entry is a 500, which is the correct default for an unrecognised condition. The
catalogue holds the user-facing copy, so wording is fixed in one place. Catalogue
messages are static; anything dynamic belongs in `data`.

The catalogue generalises the `ERROR_STATUS` table that used to live in
`divisions.controller.js`, which was the reference for the shape.

A catch-all 404 handler for unmatched routes, `api/src/middleware/notFound.js`, sits
immediately before the error middleware in `app.js`. `requireAuth` hands its 401 to the
same middleware rather than responding itself, so it too uses the envelope.

On the client, `tourganiser-ui/src/requests.js` has one `request` helper behind every
endpoint wrapper. It throws an `ApiError` carrying the display-ready `message`, the HTTP
`status` and any `data`, and it retries only when `fetch` itself rejects — never a 4xx
or a 5xx.

## Authentication

Scheme: JWT issued by the API, stored in an httpOnly cookie named `token`.

Flow:

1. `POST /api/users/signup` or `POST /api/users/login` validates credentials.
2. Service signs a JWT with `JWT_SECRET` containing `{ id, username, email, admin }`.
3. Controller sets it as a cookie using `sessionCookieOptions()` from
   `api/src/config/auth.js`: `httpOnly` always, plus `secure` and `sameSite: 'none'` in
   production, `sameSite: 'lax'` in development.
4. A global middleware in `api/src/app.js` runs before every route. It skips the
   `publicRoutes` allowlist, otherwise verifies `req.cookies.token` and sets `req.user`
   to the decoded payload, or to `null` if the token is missing or invalid.
5. Routes that must not be reachable anonymously add the `requireAuth` middleware from
   `api/src/middleware/requireAuth.js`, which returns 401 when `req.user` is null.
6. `POST /api/users/logout` clears the cookie with the same flags it was set with.

Session lifetime is 24 hours, defined once in `api/src/config/auth.js` as
`SESSION_TTL_MS` and `SESSION_TTL_JWT`. Both the JWT expiry and the cookie `maxAge`
derive from it — never hardcode either at a call site.

Three access levels:

| Level | Meaning |
|---|---|
| public | In the `publicRoutes` allowlist. The middleware does not even look for a token. |
| any | Runs with or without a session. `req.user` may be null and the handler must cope. |
| required | Guarded by `requireAuth`. Returns 401 without a valid session. |

Login failures return a single generic message for both an unknown email and a wrong
password. This is deliberate — distinguishing them allows account enumeration. Do not
reintroduce separate cases.

Still missing: **ownership checks**. `requireAuth` proves a caller is logged in, not
that they own the resource. See Security Recommendations.

The frontend sends `credentials: 'include'` on every request. CORS is configured with
`credentials: true` and an origin of `FRONTEND_URL` (plus `http://localhost:5173` when
`NODE_ENV === 'development'`).

## Endpoint Reference

Implemented:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Liveness and readiness. See below. |
| POST | `/api/users/signup` | public | Create account, set cookie |
| POST | `/api/users/login` | public | Authenticate, set cookie |
| POST | `/api/users/logout` | any | Clear cookie |
| GET | `/api/users/check-login` | any | Report login state |
| GET | `/api/users/profile` | required | Fetch the caller's own profile, self-scoped from `req.user` |
| GET | `/api/users/profile/tournaments` | required | The caller's created tournaments, flat, `start_date DESC` |
| GET | `/api/users/profile/saved-tournaments` | required | The caller's saved tournaments, flat, `start_date DESC` |
| POST | `/api/tournaments/create` | required | Create tournament and divisions |
| GET | `/api/divisions/:divisionId/progression` | required + owner | Proposed ranking and qualifiers for the current round. Read only. |
| POST | `/api/divisions/:divisionId/progression` | required + owner | Commit the confirmed ranking and advance the round |
| PUT | `/api/divisions/:divisionId` | required + owner | Replace a division's teams and structure |
| DELETE | `/api/divisions/:divisionId` | required + owner | Remove a division. Cascades to its teams and fixtures; repairs the schedule. |
| POST | `/api/tournaments/:tournamentId/divisions` | required + owner | Add a division to a Not Started tournament |
| PUT | `/api/tournaments/:tournamentId/schedule` | required + owner | Save the tournament schedule |
| GET | `/api/tournaments/` | any | List tournaments. Public browsing. |
| GET | `/api/tournaments/:tournamentId` | any | Tournament detail view. Returns `loggedIn` so the UI can adapt. Cached — see below. |
| POST | `/api/tournaments/:tournamentId/save` | required | Save a tournament to the caller's profile. Idempotent — saving twice is not an error. Refuses the caller's own tournament with `CANNOT_SAVE_OWN_TOURNAMENT` (409). |
| DELETE | `/api/tournaments/:tournamentId/save` | required | Unsave. A tournament that was never saved is also not an error. |

Both save endpoints answer `{ success: true, message, data: { tournamentId } }`.

`PUT /:tournamentId/schedule` left this table on 2026-08-10 and is described below. It
was a stub only because the validation had not been written, and an endpoint that accepts
an unvalidated schedule is worse than one that accepts none.

The three per-team stubs — `POST /:divisionId/teams`, `PUT /:divisionId/teams/:teamId`
and `DELETE /:divisionId/teams/:teamId` — were **removed** on 2026-08-10, superseded by
`PUT /api/divisions/:divisionId`. Their paths are gone rather than unimplemented, and now
answer 404.

### Health

`GET /api/health` is mounted in `app.js` above the session middleware, so it needs no
cookie and pays for no JWT verification. It runs `SELECT 1` through the pool, because
"the process is up" would report healthy while every real request returned a 500.

| Status | Body |
|---|---|
| 200 | `{ success: true, message: "OK", data: { database: "up" } }` |
| 503 | `SERVICE_UNAVAILABLE` in the standard envelope, when the pool does not answer |

The 503 is an `AppError` like any other, so it is not logged as a fault — reporting a
database that is down is what the endpoint is for, not a surprise.

### Caching the tournament view

`GET /api/tournaments/:tournamentId` is the one cached response. Added 2026-08-11.

The server sends an `ETag`, plus `Vary: Cookie` and `Cache-Control: no-cache`. A
client may store the body but must revalidate before reusing it. Send the stored
value back as `If-None-Match`; an unchanged tournament answers **304** with no body.

The validator is built from two things, and both matter:

| Half | What it is |
|---|---|
| Data | The greatest `last_update` across the tournament row and its divisions |
| Viewer | The requesting user's id, or anonymous |

**The viewer half is not optional.** The payload carries `creator` and `loggedIn`,
which depend on who is asking rather than on when anything changed. An ETag built
from the timestamp alone would give one value to two genuinely different
representations, and a signed-out reader presenting the organiser's validator would
get a 304 — then render the organiser's cached page, management controls included.
Hashing the viewer in means a different reader never matches. `Vary: Cookie` is the
same guarantee for any shared cache in between.

The id is hashed, not embedded: an ETag is echoed by clients and stored by caches,
and there is no reason to put an identifier in either.

A tournament whose change key cannot be determined is sent with no `ETag` at all and
is never answered with a 304. Unknown means refetch.

Express's own automatic ETag is **disabled** (`app.set("etag", false)`). It content-
hashes every JSON response, which would both override the decision above and make the
validator a hash of a body containing `creator` — a meaning nobody chose.

**Two CORS settings are load-bearing**, because the frontend and API are on different
origins:

- `exposedHeaders: ['ETag']` — cross-origin JavaScript can only read the safelisted
  response headers, and `ETag` is not one. Without it the client reads null, stores no
  validator and never revalidates: the cache looks fine and does nothing.
- `allowedHeaders` includes `If-None-Match` — it is not a safelisted *request* header,
  so sending it triggers a preflight, and an unlisted header means the browser blocks
  the request entirely.

Both were missing when this first went in, and neither is detectable from the test
suite: supertest does not enforce CORS. `app.cors.test.js` asserts the headers are
advertised, which is as close as a test can get.

On the client, `requests.js` holds the one cached payload in memory, keyed by
tournament and session. Not `localStorage`: a stale organiser payload surviving a
browser restart is worse than no cache. The cache is cleared on logout and whenever
`sessionVersion` moves — though correctness does not rest on that, since the server
would refuse to revalidate another session's entry anyway.

### Editing a division's teams

`PUT /api/divisions/:divisionId`. Body: the division's full intended team list, plus
`num_groups` and `knockout_teams`.

```json
{
  "teams": [{ "id": "<teamId>", "name": "Aces" }, { "name": "Eagles" }],
  "num_groups": 2,
  "knockout_teams": 4
}
```

A team with no `id` is new; a team in `state.teams` and absent from the list is removed.
The client never declares which it is doing. The service compares the incoming ids
against `state.teams` and decides:

- **Same set, same order** — a rename. Only the names that moved are written. Nothing
  structural depends on a name, so fixtures and the schedule are untouched and this is
  permitted at any point in the tournament.
- **Same set, different order** — a reseed. List position is the seeding, so `state.teams`
  is written in the submitted order and any name changes go with it in the same
  transaction. `state.rounds` is left alone: pool groups hold team ids and knockout groups
  hold rank indices, so neither depends on this order. Allowed only while the tournament
  is `Not Started` — see `docs/decisions.md`, "Seeding May Only Be Reordered Before A
  Tournament Starts".
- **Different set** — the division is rebuilt: fixtures deleted and regenerated, teams
  reconciled, `state` rewritten in full, and that division's entries removed from
  `tournaments.schedule`. Breaks and every other division's placements survive; the
  column is repaired, never nulled.

Teams and structure cannot be changed independently, which is why this is one endpoint
rather than three: a team count change alters group sizes and may alter the knockout
shape. See `docs/decisions.md`, "Changing A Division's Teams Regenerates Its Structure".

Rejections:

| Status | Meaning |
|---|---|
| 400 | Missing or nameless team list, a duplicate name or id, an id the division does not hold, or a group/qualifier count the team count cannot support |
| 403 | Caller does not own the tournament |
| 404 | No such division |
| 409 | `TOURNAMENT_ALREADY_STARTED` — a rebuild or a reorder after the tournament has started, or `DIVISION_HAS_RESULTS` where a rebuild's division already holds a completed fixture |

A rebuild's gate is two checks rather than one because a status can simply be wrong and a
completed fixture cannot. A reorder has only the status check: it destroys nothing, so
there is no second condition for the first to be wrong about. `num_groups` and
`knockout_teams` are required on a rebuild and neither is adjusted to fit: the organiser
confirms them against the new team count in the client, and correcting their choice
without saying so is worse than refusing it.

Success returns `rebuilt` and `reordered`, the resulting team list in seed order, and —
for a rebuild — the fixture count and how many schedule entries were dropped.

### Saving a schedule

`PUT /api/tournaments/:tournamentId/schedule`. Body: `{ "schedule": { … } }`, the whole
schedule exactly as the client holds it. `docs/schedule.md` is the source of truth for
that object's shape; the payload is what `serialiseScheduleForSave` produces.

The schedule is replaced, never merged — the client holds the entire object, so a partial
save has no meaning. Success returns `{ id, entries }`, the number of entries stored.

The generator stays in the client and the server validates on write, settled 2026-08-08
in `docs/decisions.md`. The server rejects the **impossible**; it does not judge whether a
schedule is **good**. A partial schedule is legal and one that places nothing is legal.

Rejections. One code per rule rather than one `INVALID_SCHEDULE`, because the message is
display-ready by contract and "that schedule is invalid" does not tell the organiser
which rule they broke. Each carries the offending entry ids in `data`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `SCHEDULE_MALFORMED` | Not the documented shape — a missing id, day or time, a duplicate entry id, an unrecognised `type`, a fixture entry with no `fixtureId` |
| 400 | `SCHEDULE_TIME_INVALID` | `endTime` is not after `startTime` |
| 400 | `SCHEDULE_DAY_OUT_OF_RANGE` | An entry's `day` falls outside the tournament's dates |
| 400 | `SCHEDULE_FIXTURE_UNKNOWN` | An entry names a fixture that is not this tournament's |
| 400 | `SCHEDULE_FIXTURE_REPEATED` | The same fixture is placed twice |
| 409 | `SCHEDULE_COURT_CLASH` | Two entries overlap on the same court. `courtId: null` spans every court that day, so an all-courts break clashes with everything |
| 409 | `SCHEDULE_TEAM_CLASH` | A team is required in two places at once |
| 409 | `SCHEDULE_ROUND_ORDER` | A fixture starts before an earlier round of its own division has finished |
| 403 | `NOT_TOURNAMENT_OWNER` | Caller does not own the tournament |
| 404 | `TOURNAMENT_NOT_FOUND` | No such tournament |

`title`, `notes` and `officials` are free text and are stored without inspection, as are
`days`, `courts` and `settings`.

The write takes a `SELECT … FOR UPDATE` on the tournament row before reading the fixtures
it validates against, because a division rebuild repairs the same column under the same
lock. Taking the lock first is what makes both interleavings safe — see
`docs/schedule.md`.

Called by the frontend but **not implemented** on the backend. `fixtures.route.js` is an
empty router and `fixtures.controller.js` is an empty file, although the services and
repositories behind them exist:

### Round progression

Two steps, deliberately separate. `GET` computes the default ranking under
`docs/tournament-rules.md` and returns it with the teams that would qualify. The
organiser reviews, optionally reorders or substitutes, then `POST`s the confirmed list
as `{ "teams": ["<teamId>", ...] }`.

The confirmed list is untrusted input that writes into `divisions.state`, so the commit
recomputes the ranking from scratch and validates rather than trusting the proposal it
issued. Rejections:

| Status | Meaning |
|---|---|
| 400 | Empty list, duplicate team, wrong qualifier count, or a team that did not play the round |
| 403 | Caller does not own the tournament |
| 409 | Round still has unplayed fixtures, is the final round, or the next round has already started |

Both the confirmed list and the computed default are stored on the round, along with a
`resultsAmended` flag, so an unexpected bracket can be traced to either the rules or a
manual override.

Re-progression is allowed only while no fixture in the next round has been played. Once
one has, the commit returns 409 rather than discarding real scores.

The proposal includes each team's name alongside its id and record, so the client does
not need a second lookup. Ids are the identity throughout — two teams in a division may
share a name.

On commit, the next round's placeholder fixtures are bound to real teams:
`nextRound.groups[i]` holds two positions in the confirmed results, and
`nextRound.fixtures[i]` is the fixture they belong to. Fixtures are updated in place
rather than recreated, so their ids stay stable and any schedule referencing them
survives.

### Pending

These are the paths to build, not the paths the frontend currently calls. The old paths
put verbs at the front (`/tournaments/delete/:id`, `/divisions/updateTeams/:divisionId`);
the convention below replaced them on 2026-08-08.

| Method | Path | Replaces |
|---|---|---|
| POST | `/api/tournaments/:tournamentId/start` | `/tournaments/start/:tournamentId` |
| POST | `/api/tournaments/:tournamentId/end` | `PUT /tournaments/end/:tournamentId` |
| DELETE | `/api/tournaments/:tournamentId` | `/tournaments/delete/:id` |
| PUT | `/api/fixtures/:fixtureId/result` | `POST /fixtures/result/:fixtureId` |

The follow, schedule and team-management paths left this table on 2026-08-08 — they are
routed now, and listed above as 501s. `PUT /api/divisions/:divisionId/schedule` is gone
from it entirely: the schedule moved to the tournament, so the replacement is
`PUT /api/tournaments/:tournamentId/schedule`. `PUT /:divisionId/teams` left it on
2026-08-10: reordering seeds is part of submitting the whole list, so
`PUT /api/divisions/:divisionId` is the replacement for `/divisions/updateTeams/:divisionId`
as well.

Also renamed: `POST /api/tournaments/create` becomes `POST /api/tournaments`.

`/divisions/updateRounds/:divisionId` is **not** in the list. The progression endpoints
supersede it and it is deleted rather than implemented — see `docs/decisions.md`, "The
Server Has Authority Over Tournament State".

`/api/collection/create` and `/api/collections` are also gone. Collections were replaced
by a single tournament holding multiple divisions, and the feature is removed.

`GET /api/users/profile/:id` — the `NOT_IMPLEMENTED` stub that previously had an empty
`try` block and never called `res`, so an authenticated request hung until the client
timed out — is gone. It is now `GET /api/users/profile`, self-scoped via `req.user.id`:
the frontend had no way to obtain another user's id (only `username` and `loggedIn`
travel in `AuthContext`), so the `:id` param could never have been called with a real
value in the first place.

### Path convention

Settled 2026-08-08. Resource-oriented, following REST:

- **Nouns only in path segments.** Never a verb. `POST /api/tournaments`, not
  `/api/tournaments/create`.
- **Collections are plural.** `/api/tournaments`, `/api/divisions`, `/api/fixtures`.
- **The HTTP method carries the intent** for plain CRUD. `POST` creates, `GET` reads,
  `PUT` replaces, `DELETE` removes.
- **Genuine actions become sub-resources** of the thing they act on:
  `/api/tournaments/:tournamentId/start`. This is why start and end are not a
  `PATCH { status }` — the server owns status transitions, and a generic PATCH invites
  the client to assert one. `GET /api/divisions/:divisionId/progression` already follows
  this shape and is the model.
- **Path parameters name their resource.** `:tournamentId`, never `:id`.

## Known Drift

None. The response envelope, the error handling and the client's request layer were
converted together on 2026-08-08 — they are coupled, so neither side could be changed
alone, which is why the auth fixes of 2026-08-07 left the error shape untouched.

Cleared by that work:

- `fetchTournaments` returned the payload in `message`; `fetchTournamentDetails`
  returned ad-hoc top-level `loggedIn` and `creator`; `createTournament` returned a
  top-level `id` with a 200.
- Error paths in `tournaments.controller.js` and `users.controller.js` returned a bare
  `{ error: "..." }`; `checkLogin` returned a bare `{ loggedIn, user }`.
- `signup` returned `user` as an object, so `Login.jsx` stored an object where a string
  was expected.
- `login` returned no user information, so the UI rendered **"Welcome, undefined"**.
- `fetchWithRetry` read `data.error`, discarded the HTTP status, and threw a plain
  object rather than an `Error`, so `error.message` was `undefined` in `Login.jsx`'s
  catch blocks and the user saw an empty message.
- A duplicate email at signup was a 500. `db.js` and the repositories now preserve the
  pg error as `cause`, so it is a 409 that says so.

## Security

Implemented:

- `requireAuth` middleware, applied to `POST /api/tournaments/create`, the three
  `/api/users/profile*` routes, both progression endpoints, `PUT /api/divisions/:divisionId`,
  and `POST`/`DELETE /api/tournaments/:tournamentId/save`. The other live endpoints are
  intentionally anonymous: browsing and viewing a tournament do not need an account.
- Session lifetime unified at 24 hours in `api/src/config/auth.js`.
- CORS `allowedHeaders` corrected — it was previously spelled `headers`, which `cors()`
  ignores, and held a single comma-joined string instead of an array.
- Login failures are generic, so responses cannot be used to enumerate accounts.
- `server.js` exits at boot if `DATABASE_URL` or `JWT_SECRET` is unset.
- Removed the per-request path logging in `app.js` and the `console.log(tournamentData)`
  in `tournaments.controller.js`, which wrote user-submitted content to logs.
- Length and type validation at the service boundary, via `assertText` in
  `api/src/utils/validation.js`. `username` and `email` are checked at 100 and
  `location` at 50, the column widths in `docs/database.md`; `tournaments.name` and
  `description` are unbounded `text`, so they carry application limits of 100 and 2000.
  An over-length or wrong-typed field is now `FIELD_TOO_LONG` or `FIELD_INVALID` — a 400
  carrying `{ field, max, length }` in `data`, since catalogue messages are static.
  Passwords are deliberately unlimited: they are stored as a fixed-size bcrypt hash.
- `helmet`, mounted first in `app.js` so the headers reach every response including
  errors and 404s. It also removes the `X-Powered-By` banner Express sets by default.
- Rate limiting on `POST /api/users/login` and `POST /api/users/signup`, via
  `express-rate-limit` in `api/src/middleware/rateLimit.js`. Ten attempts per minute per
  IP, shared between the two routes. Nothing else is limited: browsing and viewing a
  tournament are anonymous and legitimate, and repetition buys an attacker nothing there.
  The rejection is handed to the error middleware as `TOO_MANY_REQUESTS` rather than
  answered by the limiter, so a 429 carries the same envelope as every other failure.
  Advertised with `RateLimit-*` headers; the obsolete `X-RateLimit-*` ones are off.
- `app.set("trust proxy", 1)`. Render terminates TLS and forwards, so without it `req.ip`
  is Render's proxy and every visitor would share one rate-limit bucket. One hop rather
  than `true`, so the value cannot be forged: the trusted proxy appends the real peer to
  `X-Forwarded-For` after anything the client sent.
- bcrypt `saltRounds` raised from 10 to 12. No migration: bcrypt stores the cost inside
  the hash, so existing passwords keep verifying at 10 and only new ones are written at
  12. The dead duplicate of the constant in `users.repository.js` is gone — hashing has
  lived in the service since the error-handling work.

Outstanding, in rough priority order:

- **Ownership checks.** Still unimplemented outside round progression, and urgent the
  moment the pending division and fixture endpoints are wired up. The approach was
  settled on 2026-08-08: the check lives in the service, not in middleware. Every
  mutating service function takes `userId` as a required parameter and resolves the
  owner as part of a fetch it already needed. `requireAuth` proves identity; the service
  proves permission. See `docs/decisions.md`, and `progression.service.js` for the
  reference implementation.
- Extend the same length and type validation to division and team names, which
  `divisionService.createDivision` still passes through unchecked. `divisions.type` is
  `varchar(50)` and both names are unbounded `text`.

Nothing is deferred. `helmet`, `express-rate-limit` and the bcrypt cost increase were
approved on 2026-08-10 and implemented; they are listed above.
