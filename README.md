# Tourganiser

A web application for creating and running volleyball tournaments. It builds a suitable
tournament format from the number of teams entered, generates fixtures, and tracks
results and standings through pool and knockout stages.

## Layout

| Path | Contents |
|---|---|
| `api/` | Node.js + Express backend |
| `tourganiser-ui/` | React + Vite frontend |
| `docs/` | Project documentation |
| `StreamScoreboard/` | Unrelated. Ignore. |

## Running

Backend, from `api/`:

    npm install
    npm start

Runs `node --watch src/server.js`, listening on `PORT`.

Frontend, from `tourganiser-ui/`:

    npm install
    npm run dev      # dev server on http://localhost:5173
    npm run build    # production build
    npm run lint     # ESLint

There is no test suite.

## Environment

`api/.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `JWT_SECRET` | Signing secret for auth tokens |
| `FRONTEND_URL` | Allowed CORS origin |
| `PORT` | API listen port |
| `NODE_ENV` | `development` or `production`. Controls CORS origins and cookie flags. |

`tourganiser-ui/.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the API, including the trailing `/api/` |

Both `.env` files are gitignored and must not be committed.

## Stack

React, Vite and React Router on the frontend. Node.js and Express on the backend.
PostgreSQL on Neon, accessed with raw `pg` — no ORM. Hosted on Render.

## Documentation

Start with `docs/architecture.md`. It records what is actually built, which is not the
same as what is designed.

- `docs/architecture.md` — stack, layering, current build state, scheduling design
- `docs/database.md` — schema. Source of truth where code disagrees.
- `docs/division-state.md` — shape of the `divisions.state` JSONB
- `docs/api.md` — HTTP contract, auth flow, endpoint reference
- `docs/tournament-rules.md` — domain terminology and rules
- `docs/known-limitations.md` — what is broken or missing
- `docs/decisions.md` — architectural decisions and why
- `docs/project-philosophy.md` — how changes should be made
- `docs/roadmap.md` and `docs/future-features.md` — planned work
- `docs/git-hygiene.md` — one-off repository cleanup steps
