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

### Password reset and change

No mechanism exists for either, and no "Forgot password?" on the sign-in form. A reset
needs a token store with an expiry and a way to send email, neither of which the
application has. A signed-in password *change* is much smaller and needs neither — worth
treating as two features rather than one.

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

### Bulk team entry

Adding teams one at a time is slow for a thirty-two team division. Two candidates, and
they are independent: a file upload accepting a text or CSV file, and a textarea accepting
pasted lines. The textarea is far cheaper and covers most of the need — it needs no file
handling, no parsing library and no upload endpoint, since the creation payload already
carries the team list as plain names.

### Location as a map reference

`tournaments.location` is `varchar(50)` free text. Using the Google Maps API or similar
would let an organiser pick an exact place and let spectators find it. That means storing
coordinates or a place id alongside or instead of the string — a schema change — and it
adds a third-party dependency with an API key to manage.

### Scoresheets

Upload a scoresheet template to a tournament, then download one per fixture with the
details already filled in: competition name, date, match time, teams, and eventually a
player list.

Two halves worth separating. Generating a prefilled sheet from data the application
already holds is self-contained. Accepting an arbitrary uploaded template and knowing
where to write on it is a much larger problem, and would need file storage, which the
application does not currently have anywhere.

A player list is a further prerequisite: teams are `(id, name, division_id)` and there is
no concept of a player.

## Other Candidates

- Live scoring
- Statistics
- Public tournaments
- Officials management
- Improved scheduling
- Stream integration
- Forfeit as a first-class fixture status, rather than relying on the organiser
  recording a nominal scoreline by hand
