# Future Features

Ideas and planned work. Do not implement anything listed here unless explicitly
requested.

## Configurable Ranking Basis

> Shipped 2026-09-24 in release 1.1 — `divisions.ranking_basis`, set from the Settings
> tab. See `docs/tournament-rules.md`, "Ranking order". Kept below as the original brief.

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

> Shipped 2026-09-24 in release 1.1 as editors: result entry for the current round only,
> added by email or username with no invite step. See `docs/api.md`, "Editors". An
> invite/accept flow and any wider editor rights remain future work.

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

What the 2026-10-22 review found missing from editors as shipped:

- Profile has no "Tournaments I can edit" list, so an editor has no route to the
  tournaments they were given.
- The person is not told they were added, and cannot accept or decline.
- There is no per-court scorer role.

### Account completeness

Alongside password reset (above): change email or username, delete account (the privacy
policy promises deletion on request, which today is a manual job), and sign out of other
devices. The last needs sessions to be revocable — see `known-limitations.md`,
Authentication.

## For Spectators

From the 2026-10-22 review. Most people who open a tournament are players and parents on
a phone at the venue, and this is the side of the app with the most room to grow.

### Live view

Poll the tournament while the tab is visible (15–30s), show "updated 20s ago" and a Live
badge on matches in progress. The ETag already exists for this. It only becomes cheap once
the 304 path skips the full payload build — see `known-limitations.md`, Performance.
Distinct from live *scoring* below: this is about seeing saved results without
reloading.

### Team pages and "follow my team"

A page per team: its fixtures with court and time, its results, its pool position and its
next match, at a shareable URL. "Follow" can be per device, with no account. This is what
most people at a tournament are actually looking for.

### Sharing kit

Copy-link and WhatsApp share buttons, a QR code on the overview and on printed schedules
("scan for live results"), per-page titles, and Open Graph previews. Previews need a small
server-rendered meta endpoint, since the frontend is a single-page app.

### Venue display

A full-screen court board for a projector or TV at the hall: what is on each court now,
what is next, the latest results, rotating automatically.

## For Organisers

### Edit tournament details

Name, location, dates and description cannot be changed after creation. Changing dates
interacts with the saved schedule, whose entries are validated against the tournament's
date range.

### Visibility

Draft, unlisted (link only) and public. Today a tournament is public from the moment it
is created, so tests and half-built events appear on Discover. A reminder, or an
automatic end, for tournaments still Ongoing well past their end date would keep
Discover current too.

### Setup checklist

Replace Start Tournament as the main call to action on a Not Started tournament with
steps showing done or not done: teams and seeding, schedule, scoresheet, editors, start.

### Match format per division

Best of 3 or 5, points per set (25/15), and an optional cap. It would drive automatic set
rows and auto-ending in score entry, score sanity checks, correct FIVB points, and the
scoresheets. Needs a key in `divisions.state` — see `known-limitations.md`, Tournament
Logic.

### Courtside scorer mode

For an editor: pick a court, and see only that court's current and next match with large
controls. Optionally score point by point, which would also give spectators true live
scores. Queue writes when offline and send them when the connection returns — venue wifi
is often poor.

### Running late

Shift every remaining match by N minutes, across all courts or on one court. Today each
entry has to be moved by hand.

### More formats

- pool-aware crossovers, so each pool's 1st and 2nd are in opposite halves;
- an optional 3rd-place match;
- single elimination (stubbed in `generateDivisionDetails`);
- double elimination;
- a second pool phase (gold and silver pools), common in volleyball;
- Swiss.

### Duplicate a tournament

Copy last year's event as a template with new dates. Annual events are the core use case.

### Import and export

Import teams from CSV or a spreadsheet paste. Export results and standings as CSV or PDF,
and a printable results summary.

### Result history

`fixtures.entered_by` keeps only the last writer. A per-fixture change log ("21-19 changed
to 21-17 by X at 10:42") would settle disputes.

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
  recording a nominal scoreline by hand. Raised in priority by the 2026-10-22 review: the
  live data already has a team named "BYE" and hand-typed 15-0 forfeits, and a cancelled
  knockout match currently corrupts progression (`known-limitations.md`, Tournament
  Logic). Should come with a "withdraw team" action that forfeits that team's remaining
  matches.
- Notifications — push or email ("your team plays in 15 minutes on Court 3").
- Admin moderation of public tournaments. The `admin` flag exists but nothing uses it
  beyond a badge on Profile.
