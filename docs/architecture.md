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

Two parts are large enough to have their own structure, and each owns a stylesheet
outside `App.css` with its own class prefix. The prefixes are what make either one's
cleanup sweep safe: a rule can be deleted on the evidence of one page's markup only if no
other page can be using it.

The tournament view lives in `tourganiser-ui/src/components/tournament/`, is entered
through `pages/View.jsx`, and is styled by `src/styles/tournament-view.css`. Its classes
are prefixed `tv-`.

Tournament creation lives in `tourganiser-ui/src/components/create/`, is entered through
`pages/CreateTournament.jsx` at `/tournaments/create`, and is styled by
`src/styles/create-tournament.css`. Its classes are prefixed `ct-`. The page holds the
whole creation state — details, divisions and their teams — and sends it in the single
`POST /api/tournaments/create` request. Divisions are built in a modal rather than on the
page, and the draft is autosaved to `localStorage` by `src/utils/createDraft.js`, which
discards anything malformed or of an older version rather than risking a throw on mount.

`pages/View.jsx` makes the single `GET /api/tournaments/:id` request that feeds the whole
page and owns the state shared across sections: the active tab, the selected division,
and one `reload()` that every mutation calls. `TournamentShell` renders the subheader and
navigation immediately; only the tab content waits on the request.

`components/ScheduleMakerModal.jsx` is loaded with `React.lazy`. It used to pull in jsPDF,
html2canvas and DOMPurify with the PDF export — around half the application's JavaScript
for a screen only an organiser opens. Printing through the browser replaced that on
2026-08-10 and all three dependencies are gone, taking the chunk from roughly 427kB to
30kB. It stays lazy because it is still the largest single screen: a grid, a list, an
inspector, a generator and two print layouts.

It was the first component rendered through a portal, and the creation page's modals now
follow the same pattern through `components/create/CreateModal.jsx`. `createPortal` puts
them on `document.body` so that neither `<main>`'s layout nor the header's and footer's
`z-index` can clip them. See the frontend traps below.

## Conventions
- PascalCase for files/components.
- camelCase for variables/functions.
- Prefer reusable CSS classes.
- Plain CSS only.
- DTOs/types may be introduced only when they provide clear value.

### Frontend traps worth knowing before writing UI

Each of these cost real time to diagnose during the tournament view redesign. All fail
silently — the page still renders, it is just wrong.

**Do not use `<header>`, `<main>` or `<img>` in new markup.** `App.css` styles them as
bare element selectors. `header` in particular is the site's fixed top bar —
`position: fixed; width: 100vw; height: 80px` — so a semantic `<header>` inside a card is
torn out of its container and stretched across the viewport. It reads as a flexbox
problem and is a specificity problem. Use a `div` with a class.

**Write `minmax(min(Npx, 100%), 1fr)`, never `minmax(Npx, 1fr)`.** A grid track whose
minimum exceeds its container does not shrink; it overflows.

**A grid track that permits shrinking does not cause it.** If a cell's children are
`white-space: nowrap`, the cell's min-content width is their sum and it overflows
whatever the track says. `min-width: 0` does not help, because the children still cannot
break. Give the cell its own row at that breakpoint, let it wrap, or let the children
ellipsis.

**Two ESLint rules dictate how files are split**, and both are errors rather than
warnings. `react-refresh/only-export-components` forbids a module exporting both a
component and a non-component — the fix is always a new plain `.js` module.
`react-hooks/set-state-in-effect` forbids a synchronous `setState` in a `useEffect` body,
including through a function called from it; `useLayoutEffect` is the sanctioned escape
for measure-then-store.

**`npm run lint` has 5 pre-existing errors** in `ThemeContext.jsx`, `ConfirmDialog.jsx`,
`ScoreUpdateModal.jsx` and `main.jsx`. Judge a change by whether that count moves.

**The site header outranks most overlays.** `header` carries `z-index: 1000` and
`.site-footer` carries `10`, both in the root stacking context, so an overlay has to
clear 1000 to sit over the whole viewport. The scale as it stands:

| Layer | `z-index` | Class |
|---|---|---|
| Score modal, next-round modal | 5 | `.modal-overlay`, `.modal-backdrop` |
| Site footer | 10 | `.site-footer` |
| Site header | 1000 | `header` |
| Schedule maker | 1100 | `.schedule-maker-backdrop` |
| Confirmation dialog | 1200 | `.confirm-backdrop` |
| Tooltip | 1000000 | `.tooltip-box` |
| Loading screen | 10<sup>15</sup> | `.loading-container` |

The confirmation dialog is above every modal on purpose: it is always asked on behalf of
one, and the schedule maker's Discard prompt is asked from inside a backdrop at 1100.

**The first two rows are a known bug**, recorded in `docs/known-limitations.md`: at 5,
those two modals render underneath the header and the footer.

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
  `divisions.repository.js` carry functions for updating teams and groups, but no route
  or controller reaches them. The team routes exist as of 2026-08-08 and throw
  `NOT_IMPLEMENTED`.
- `fixtures` — `fixtures.route.js` is an empty router and `fixtures.controller.js` is an
  empty file, so no fixture endpoint exists. The service and repository do.
- `users.controller.js` `getUserProfile` is an empty stub with a live route.

The frontend already calls the missing endpoints. `docs/api.md` lists which ones.

Consequence: wiring up the rest of divisions and fixtures is mostly controller and route
work, not new business logic. Check the existing service before writing anything new.

Creating a tournament used to fail against the documented schema. As of 2026-08-08 it
works, and it is one transaction: the tournament, its divisions, their teams and their
fixtures all commit together or none of them do. `createTournament` in
`tournaments.service.js` opens that transaction through `withTransaction` and passes the
client down; the repositories take it as their last parameter.

## Code and Schema Drift

The database schema in `docs/database.md` is the source of truth. Where the code
disagrees, the code is wrong. Known cases:

- `users.repository.js` references a `friends` table. It does not exist. It is reserved
  for a future social feature and the code is ahead of the schema.

The `RETURNING num_groups` in `updateTeams` was fixed on 2026-08-08; group count is
derived from `state.rounds[].groups`.

The `teams` drift is closed as of 2026-08-09, in favour of the schema. `createTeam`
inserts `(id, name, division_id)`, a team belongs to exactly one division, and the
`user_id` design the code briefly carried is gone. Both `teams.division_id` and
`state.teams` express membership; which owns what is recorded in
`docs/division-state.md`.

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

Persistence: schedules are stored as JSONB on `tournaments.schedule`, written by
`tournamentRepository.updateSchedule`. `PUT /api/tournaments/:tournamentId/schedule`
exists but throws `NOT_IMPLEMENTED`, so nothing can be saved through the API yet.

The schedule was on `divisions.schedule` until 2026-08-08, with
`tournamentViewFormatter.js` falling back to a copy inside `divisions.state`. Both are
gone. A schedule spans the tournament because divisions share the same physical courts,
and a per-division schedule could double-book one; the tournament-level column makes that
impossible to express. The formatter now emits `tournament.schedule` and a single
`dashboard.hasSchedule`, rather than a schedule and a `hasSchedule` per division.

The shape of `tournaments.schedule` is not documented anywhere. It is implicit in
`scheduleUtils.js` and `ScheduleMakerModal.jsx`, and carries a `SCHEDULE_VERSION`
constant. Writing that contract down is a prerequisite for the validator, which cannot
be specified against an undocumented payload.
