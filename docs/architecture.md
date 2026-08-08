# Architecture

## Overview
Tourganiser is a web application for creating and managing volleyball tournaments.

## Tech Stack
Frontend:
- React
- Vite
- React Router
- JavaScript

Backend:
- Node.js
- Express
- JavaScript

Database:
- PostgreSQL (Neon)
- raw pg

Hosting:
- Render

## Folder Structure

Root
- api/
- tourganiser-ui/
- docs/
- StreamScoreboard/ (ignore)

Backend Architecture

Routes
→ Controllers
→ Services
→ Repositories
→ PostgreSQL

Supporting folders:
- `api/src/middleware/` — reusable Express middleware, e.g. `requireAuth`.
- `api/src/config/` — connection and configuration singletons, e.g. `db.js`, `auth.js`.
- `api/src/utils/` — pure helpers with no Express or database awareness.

Responsibilities

Routes
- Define API endpoints.
- Attach middleware such as `requireAuth` to the endpoints that need it.

Controllers
- Receive requests.
- Return responses.
- Convert thrown errors into HTTP responses.

Services
- Business logic only.

Repositories
- Database interaction only.

Frontend

Pages
→ Components
→ requests.js
→ Backend API

## Conventions
- PascalCase for files/components.
- camelCase for variables/functions.
- Prefer reusable CSS classes.
- Plain CSS only.
- DTOs/types may be introduced only when they provide clear value.

## Current State

The backend is mid-rebuild. Treat this section as the map of what actually works.

Last reviewed 2026-08-08.

Complete:
- `users` — routes, controller, service, repository, apart from `getUserProfile` below.
- `tournaments` — create, list, and detail only. Join, leave, start, end and delete are
  commented out in `tournaments.route.js`.
- `divisions` — round progression only. `divisions.controller.js` and
  `divisions.route.js` implement `GET` and `POST /:divisionId/progression`, backed by
  `progression.service.js` and `standings.js`. This is the newest code in the repository
  and the pattern the rest should follow: the service owns the rules, checks ownership
  via `getDivisionWithOwner`, and revalidates untrusted input; the controller maps named
  service errors to status codes through a lookup table.

Incomplete:
- `divisions` — everything other than progression. `divisions.service.js` and
  `divisions.repository.js` carry functions for updating teams, groups and schedules,
  but no route or controller reaches them.
- `fixtures` — `fixtures.route.js` is an empty router and `fixtures.controller.js` is an
  empty file, so no fixture endpoint exists. The service and repository do.
- `users.controller.js` `getUserProfile` is an empty stub with a live route.

The frontend already calls the missing endpoints. `docs/api.md` lists which ones.

Consequence: wiring up the rest of divisions and fixtures is mostly controller and route
work, not new business logic. Check the existing service before writing anything new.

Note that creating a tournament currently fails against the documented schema — see
`docs/gap-analysis.md`, item C1. Nothing downstream of creation can be exercised
end to end until that is fixed.

## Code and Schema Drift

The database schema in `docs/database.md` is the source of truth. Where the code
disagrees, the code is wrong. Known cases:

- `divisions.repository.js` writes `teams (id, name, division_id)` and selects
  `WHERE division_id = ...`. The `teams` table has `user_id`, not `division_id`.
  Division membership lives in `state.teams`, not on the team row.
- `divisions.repository.js` `updateTeams` uses `RETURNING num_groups`. The `divisions`
  table has no `num_groups` column. Group count is derived from `state.rounds[].groups`.
- `users.repository.js` references a `friends` table. It does not exist. It is reserved
  for a future social feature and the code is ahead of the schema.

Do not fix these as a batch. Fix each one when working on the feature that touches it.

## Scheduling

Scheduling is deliberately split across the two tiers. The split was settled on
2026-08-08; see `docs/decisions.md`.

Frontend:
- Automatic schedule generation, in `tourganiser-ui/src/utils/scheduleGenerator.js` and
  `scheduleUtils.js`. A generated schedule is a proposal, not a commitment.
- The schedule editing UI. Creating a schedule by hand and adjusting a generated one.

Backend:
- Validation on write, and storage. The server rejects schedules that are impossible —
  fixtures that do not belong to the division, court clashes, a team in two places at
  once, slots outside the tournament dates, a knockout fixture placed before the round
  that feeds it. It does not judge whether a schedule is *good*; court balance, rest
  time and gap minimisation are the generator's business.

An earlier version of this document planned to move the generator to a backend service.
That is cancelled. Generation produces a proposal the organiser then edits, so it does
not need server authority — only its result does.

`scheduleUtils.js` should still stay free of React and DOM references, but for a
different reason: it holds the slot and time primitives, and keeping it pure keeps it
testable.

Persistence: schedules are stored as JSONB on `divisions.schedule`. The column exists as
of 2026-08-07; the endpoint that writes it does not yet.
`tournamentViewFormatter.js` reads `division.schedule ?? state.schedule ?? null`, so it
tolerates both the dedicated column and the older location inside division state. New
code should write the column only.

The shape of `divisions.schedule` is not documented anywhere. It is implicit in
`scheduleUtils.js` and `ScheduleMakerModal.jsx`, and carries a `SCHEDULE_VERSION`
constant. Writing that contract down is a prerequisite for the validator, which cannot
be specified against an undocumented payload.
