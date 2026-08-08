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
- 400 Bad Request — validation failure
- 401 Unauthorized — missing or invalid token
- 403 Forbidden — authenticated but not permitted
- 404 Not Found — resource does not exist, or invalid UUID in path
- 409 Conflict — the request is valid but the resource is in a state that forbids it
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
| POST | `/api/users/signup` | public | Create account, set cookie |
| POST | `/api/users/login` | public | Authenticate, set cookie |
| POST | `/api/users/logout` | any | Clear cookie |
| GET | `/api/users/check-login` | any | Report login state |
| GET | `/api/users/profile/:id` | required | Fetch user profile — **not implemented, returns 501** |
| POST | `/api/tournaments/create` | required | Create tournament and divisions |
| GET | `/api/divisions/:divisionId/progression` | required + owner | Proposed ranking and qualifiers for the current round. Read only. |
| POST | `/api/divisions/:divisionId/progression` | required + owner | Commit the confirmed ranking and advance the round |
| GET | `/api/tournaments/` | any | List tournaments. Public browsing. |
| GET | `/api/tournaments/:tournamentId` | any | Tournament detail view. Returns `loggedIn` so the UI can adapt. |

Called by the frontend but **not implemented** on the backend. `divisions.route.js` and
`fixtures.route.js` are empty routers, and `divisions.controller.js` and
`fixtures.controller.js` are empty files, although the services and repositories behind
them exist:

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

| Method | Path | Frontend caller |
|---|---|---|
| POST | `/api/tournaments/join/:tournamentId` | `joinTournament` |
| POST | `/api/tournaments/leave/:tournamentId` | `leaveTournament` |
| POST | `/api/tournaments/start/:tournamentId` | `startTournament` |
| PUT | `/api/tournaments/end/:tournamentId` | `endTournament` |
| DELETE | `/api/tournaments/delete/:id` | `deleteTournament` |
| POST | `/api/fixtures/result/:fixtureId` | `updateScore` |
| POST | `/api/divisions/updateTeams/:divisionId` | `updateTeams` |
| POST | `/api/divisions/updateRounds/:divisionId` | `updateRounds` |
| POST | `/api/divisions/updateSchedule/:divisionId` | `updateDivisionSchedule` |
| POST | `/api/collection/create` | `createCollection` |
| GET | `/api/collections` | `fetchUserCollections` |

`GET /api/users/profile/:id` throws `NOT_IMPLEMENTED` and returns 501 in the standard
envelope. It previously had an empty `try` block and never called `res`, so an
authenticated request hung until the client timed out.

Note the path inconsistency in the pending set: verbs appear in paths
(`updateTeams`, `create`, `delete`) and `collection` / `collections` are inconsistently
pluralised. Worth settling on a convention before implementing them.

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

- `requireAuth` middleware, applied to `POST /api/tournaments/create` and
  `GET /api/users/profile/:id`. The other live endpoints are intentionally anonymous:
  browsing and viewing a tournament do not need an account.
- Session lifetime unified at 24 hours in `api/src/config/auth.js`.
- CORS `allowedHeaders` corrected — it was previously spelled `headers`, which `cors()`
  ignores, and held a single comma-joined string instead of an array.
- Login failures are generic, so responses cannot be used to enumerate accounts.
- `server.js` exits at boot if `DATABASE_URL` or `JWT_SECRET` is unset.
- Removed the per-request path logging in `app.js` and the `console.log(tournamentData)`
  in `tournaments.controller.js`, which wrote user-submitted content to logs.

Outstanding, in rough priority order:

- **Ownership checks.** Still unimplemented outside round progression, and urgent the
  moment the pending division and fixture endpoints are wired up. The approach was
  settled on 2026-08-08: the check lives in the service, not in middleware. Every
  mutating service function takes `userId` as a required parameter and resolves the
  owner as part of a fetch it already needed. `requireAuth` proves identity; the service
  proves permission. See `docs/decisions.md`, and `progression.service.js` for the
  reference implementation.
- Validate and length-limit user input at the service boundary. `username` and `email`
  are `varchar(100)`, `location` is `varchar(50)`; oversized input currently surfaces
  as a 500 from Postgres rather than a 400.
- Rate limit `POST /api/users/login` and `POST /api/users/signup`.

Deferred — each adds a dependency, so needs approval under `CLAUDE.md`:

- `helmet` for baseline security headers.
- `express-rate-limit` for the rate limiting above.
- Raising bcrypt `saltRounds` from 10 to 12.
