# API

Base path: `/api`

Layer responsibilities (Routes → Controllers → Services → Repositories) are defined in
`docs/architecture.md`. This document covers the HTTP contract only.

## Response Format

This is the **target contract**. Parts of the current code do not yet follow it
(see Known Drift below). New and refactored endpoints must use it.

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

- `data` carries the payload. Never put payload in `message`.
- `message` is always a string, never an object or array.
- No ad-hoc top-level keys. Anything else the client needs goes inside `data`.
- Always use an appropriate HTTP status code. `success` must agree with it.

Status codes in use:

- 200 OK — successful read or update
- 201 Created — resource created
- 400 Bad Request — validation failure
- 401 Unauthorized — missing or invalid token
- 403 Forbidden — authenticated but not permitted
- 404 Not Found — resource does not exist, or invalid UUID in path
- 500 Internal Server Error — unexpected failure

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
| GET | `/api/users/profile/:id` | required | Fetch user profile — **empty stub, see warning below** |
| POST | `/api/tournaments/create` | required | Create tournament and divisions |
| GET | `/api/tournaments/` | any | List tournaments. Public browsing. |
| GET | `/api/tournaments/:tournamentId` | any | Tournament detail view. Returns `loggedIn` so the UI can adapt. |

Called by the frontend but **not implemented** on the backend. `divisions.route.js` and
`fixtures.route.js` are empty routers, and `divisions.controller.js` and
`fixtures.controller.js` are empty files, although the services and repositories behind
them exist:

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

Warning: `GET /api/users/profile/:id` has an empty `try` block and never calls `res`.
An authenticated request to it **hangs until the client times out** — the connection is
held open and no response is ever sent. It fails closed for anonymous callers only
because `requireAuth` responds before the handler runs. Either implement it or make it
return 501.

Note the path inconsistency in the pending set: verbs appear in paths
(`updateTeams`, `create`, `delete`) and `collection` / `collections` are inconsistently
pluralised. Worth settling on a convention before implementing them.

## Known Drift

Current code that does not match the contract above. Fix when touching these files.

- `tournaments.controller.js` `fetchTournaments` returns the payload in `message`
  instead of `data`.
- `tournaments.controller.js` `fetchTournamentDetails` returns ad-hoc top-level
  `loggedIn` and `creator` keys instead of nesting them in `data`.
- Every error path in `tournaments.controller.js` and `users.controller.js` returns a
  bare `{ error: "..." }` with no `success` or `message`.
- `users.controller.js` `signup` returns a top-level `user` key.
- The frontend's `fetchWithRetry` reads `data.error` on failure, so it depends on the
  current wrong shape. Backend and frontend must change together. This is why the auth
  fixes of 2026-08-07 left the error shape alone.

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

- **Ownership checks.** `requireAuth` only proves a caller is logged in. Mutation
  endpoints should compare `req.user.id` against `tournaments.created_by` and return
  403 on mismatch. This becomes urgent the moment the pending division and fixture
  endpoints are wired up, since those mutate tournament data.
- Validate and length-limit user input at the service boundary. `username` and `email`
  are `varchar(100)`, `location` is `varchar(50)`; oversized input currently surfaces
  as a 500 from Postgres rather than a 400.
- Rate limit `POST /api/users/login` and `POST /api/users/signup`.

Deferred — each adds a dependency, so needs approval under `CLAUDE.md`:

- `helmet` for baseline security headers.
- `express-rate-limit` for the rate limiting above.
- Raising bcrypt `saltRounds` from 10 to 12.
