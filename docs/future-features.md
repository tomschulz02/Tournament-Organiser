# Future Features

Ideas and planned work. Do not implement anything listed here unless explicitly
requested.

## Configurable Ranking Basis

Pool position is currently decided by matches won, hardcoded. The organiser should be
able to choose the basis per division:

- Matches won (current, and the default)
- FIVB match points — 3 for a 3-0 or 3-1 win, 2 for a 3-2 win, 1 for a 2-3 loss, 0 otherwise
- Simplified match points — 2 for any win, 1 for a loss in a deciding set, 0 otherwise
- Total sets won

Only the first criterion in the ranking chain would change. The tiebreakers in
`docs/tournament-rules.md` stay as they are.

Needs a place to store the choice on the division, and the standings builder to read it
rather than assuming matches won.

## Accounts And Access

### Refresh tokens

The session is a single 24-hour JWT in an httpOnly cookie, defined once in
`api/src/config/auth.js` as `SESSION_TTL_MS` and `SESSION_TTL_JWT`. It expires hard: a
user who visits daily is signed out daily. A refresh token would extend an active session
rather than ending it on a fixed schedule.

Note this interacts with `sessionVersion` in `AuthProvider`, which the tournament view
keys its cache on — a silent refresh must not read as a session change, or every refresh
would discard the cache.

### OAuth

Sign in with Google. `users` has `password text NOT NULL`, so an OAuth account has no
natural value for it — the column needs to become nullable, or a provider table needs to
sit beside it. That is the decision this feature turns on, not the OAuth flow itself.

### Password reset

> Password **change** (signed-in) shipped 2026-08-29 — see `docs/roadmap.md`, Phase 7,
> and `docs/decisions.md`. This section now covers reset only.

No mechanism exists for a forgotten-password reset, and no "Forgot password?" on the
sign-in form. It needs a token store with an expiry and a way to send email, neither of
which the application has — worth deciding independently of any one feature, since
Editors (1.1) will eventually want to *invite* someone by email too, and the two features
may end up wanting the same infrastructure.

### Editors and scorers

> This supersedes **Friends**, which was removed on 2026-08-11. Friends was a step
> towards letting someone other than the organiser update a tournament, and a per-
> tournament permission is a more useful relationship than a global friendship — an
> editor is someone trusted with *this* event, not with everything you own.

A tournament currently has exactly one person who can change anything: `created_by`.
Ownership is checked in the service, per `docs/decisions.md`.

The proposal is a second role with write access to **fixture results only**, while the
organiser retains the ability to overwrite any result within the current round. That needs
a membership table joining users to tournaments with a role, and the ownership check to
become a permission check — every service that currently compares `created_by` to
`req.user.id` would consult it instead. The pattern is already in one place, which makes
this tractable, but it touches every mutating endpoint.

## Tournament Setup

### Location as a map reference

`tournaments.location` is `varchar(50)` free text. Using the Google Maps API or similar
would let an organiser pick an exact place and let spectators find it. That means storing
coordinates or a place id alongside or instead of the string — a schema change — and it
adds a third-party dependency with an API key to manage.

### Scoresheet Player List

Scoresheet downloads shipped 2026-08-29 — prefilled header fields on an organiser-chosen
template, default FIVB indoor/beach sheets or a self-service custom upload with
click-to-place field markers. What did not ship, and
is still a real gap: no player list prints on the sheet, because teams are
`(id, name, division_id)` and there is no concept of a player. Adding one is a schema
change and a division-editor UI change in their own right, not an extension of the
scoresheet mechanism itself.

## Other Candidates

- Live scoring
- Statistics
- Public tournaments
- Officials management
- Improved scheduling
- Stream integration
- Forfeit as a first-class fixture status, rather than relying on the organiser
  recording a nominal scoreline by hand
