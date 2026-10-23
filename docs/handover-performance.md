# Handover: performance and live updates

From the 2026-10-22 review, top priorities #4, #5, #9 and #10, and `known-limitations.md`,
Performance. Written 2026-10-23 after measuring production. Delete this file when the
work is done; the durable record goes into `known-limitations.md` and `docs/api.md`.

## 1. Risk declaration

**Medium.** Steps 1, 4 and 5 change shared request and caching logic; step 2 changes CORS
configuration; step 3 changes a repository query. No schema change, no new dependency,
no change to authentication.

Specific risks:

- **Serving a stale page (step 4).** If the cheap change key ever differs from the one the
  full build produces, a reader is told their cached copy is current when it is not. This
  is the risk that matters; step 4's Verify is built around it.
- **Losing typed input (step 5).** A background refresh that replaces the data while the
  score dialog is open resets its draft (the dialog re-hydrates when `fixture.result`
  changes identity). Polling must pause while any dialog is open.
- **Database load (step 5).** Every open, visible, Ongoing tournament page polls. Without
  step 4 each poll runs the full build (~6 queries); with it, one light query.
- **CORS (step 2).** Caching the preflight means a change to the allowed origins takes up
  to the cache lifetime to reach browsers that already asked.

This document is the explanation the Medium Risk process requires. Nothing is
implemented until it is approved.

## 2. How to use this document

One step per session. Each step ends with the application working and can ship alone.
Do not re-inspect anything section 3 states. Read only the files a step names. Run the
final validation once, at the end.

Order matters in one place: step 4 must land before step 5 is enabled in production,
because step 5 multiplies the requests step 4 makes cheap. Steps 1–3 and 6 are
independent.

## 3. Established facts

### Measured in production, 2026-10-23

From a browser and curl in South Africa against `https://api.tourganiser.co.za`. Public
endpoints, no session.

| Request | Time | Notes |
|---|---|---|
| `GET /api/users/check-login` (trivial) | 210–240 ms | The network floor. TCP connect is ~15–20 ms to Cloudflare's Johannesburg edge; the rest is the trip to the origin. |
| `GET /api/tournaments/:id`, 200, 64-team tournament | 270–770 ms | 328 KB JSON, sent as **26 KB brotli**. |
| Same, with matching `If-None-Match` → 304 | 250–270 ms (curl) | Only ~25–40 ms above the floor, despite doing the full build. |
| Same 304, from the browser | 420–445 ms | Includes a CORS preflight, because `If-None-Match` is not a safelisted header. |
| `GET /api/tournaments/` (Discover list) | 200–220 ms (1.2 s cold) | 48 KB uncompressed for **three** tournaments, mostly `schedule` JSON. |

What follows from that:

- **Compression is already done.** Cloudflare in front of Render brotli-compresses JSON
  (`Content-Encoding: br`, `Vary: Accept-Encoding`). The review's "no compression" item
  needs no code and no dependency.
- **Render and Neon are close.** Neon is eu-central-1 (Frankfurt). The full build runs
  about six sequential queries and costs ~25–40 ms in total, which rules out a
  cross-continent hop per query. The review's "region unverified" item can be closed.
- **The ~220 ms floor is South Africa to Europe** and is not reachable from code. What code
  controls is how many round trips a user waits for.
- **The browser makes an extra preflight round trip on most requests.** `cors()` in
  `api/src/app.js` sets no `maxAge`, so browsers cache a preflight for 5 s (Chrome's
  default) and repeat it. Every PUT/POST/DELETE (JSON body) and every conditional GET
  pays ~220 ms twice.
- Local timings in the review (1.8–3.3 s per GET, 4.2 s per save) were dominated by the
  dev machine's distance from Frankfurt. Production is several times faster.

### The score-save loop today

1. `ScoreUpdateModal` → `View.jsx` `saveResult` → `updateFixtureResult` (PUT
   `/api/fixtures/:id/result`). Server: `fixtures.service.js` `updateResult`, one
   transaction, reads `divisions.state FOR UPDATE` up to three times.
2. On success `View.jsx` calls `reload()`, which bumps `attempt` → `requestKey` changes →
   `loading = result.key !== requestKey` is true → **the whole tab is replaced by
   `<SectionState variant="loading">`** until the refetch lands.
3. That unmounts `FixturesTab` / `ScheduleTab`, whose filters are local state
   (`useState(EMPTY_FILTERS)`, `FixturesTab.jsx:32`, `ScheduleTab.jsx:50`). **Every save
   resets the division, court, stage, status and team filters, and the scroll position.**
   The score dialog survives only because it is rendered outside the tab.

### Client cache and request layer (`tourganiser-ui/src/requests.js`)

- `requestWithMeta(path, { method, body, headers }, retries = 5)` retries **any** method
  when `fetch` rejects (network failure), 500 ms apart. It never retries an HTTP error.
- `fetchTournamentData(id, sessionKey)` keeps up to 3 payloads per viewer in
  sessionStorage with their ETags, sends `If-None-Match`, and on 304 returns the cached
  payload — **freshly parsed, so every object is a new identity even when nothing
  changed.** Callers: `pages/View.jsx:79`, `pages/SchedulePrint.jsx:41`. Tested in
  `tourganiser-ui/test/tournamentCache.test.js`.

### Server side

- `GET /api/tournaments/:id`: `tournaments.controller.js` `fetchTournamentDetails` calls
  the service, then builds the ETag from `tournament.changeKey` and compares
  `If-None-Match`. The full build happens before the comparison.
- `tournaments.service.js` `fetchTournamentDetails`: `getTournamentById`,
  `getDivisionsByTournamentId`, then teams (`getTeamsByDivision` — **one sequential query
  per division**) in parallel with `getFixturesByDivisionIds`, then `isEditor` for a
  signed-in non-organiser, then attribution (two queries) for organiser/editors.
- `utils/etag.js`: `buildChangeKey({ tournament, divisions })` = the greatest
  `last_update` across the tournament row and its division rows, as a millisecond
  string, or `null` if there are none. `buildTournamentEtag(changeKey, viewerUserId)`
  hashes in the viewer and `PAYLOAD_VERSION` (3).
- Everything the view shows moves one of those stamps: triggers on both tables, explicit
  stamps in division state writes, `touchDivision` when a result is written to a round
  not in state, `touchTournament` for editor changes. Fixture and team rows carry no
  stamp of their own.
- `GET /api/tournaments/`: `tournament.repository.js` `getAllTournaments` is
  `SELECT * FROM tournaments;` — no column list, no `ORDER BY`. The service formats
  dates and groups by status. The only consumer is `pages/Browse.jsx`, whose
  `TournamentCard` reads **`id`, `name`, `status`, `location`, `start_date`,
  `end_date`** and nothing else (`description`, `schedule`, `created_by`,
  `scoresheet_template`, `last_update` are unused). `getTournamentsByCreator` and
  `getTournamentsByIds` already use explicit column lists.
- `api/` tests mock the database (`test/helpers/dbMock.js`) and assert exact SQL strings.
  Coverage is gated at **100%** (`api/vitest.config.js`), so every new branch needs a test.
- CORS tests live in `api/test/integration/app.cors.test.js`.

### What the data cannot support

| Asked for | Why not |
|---|---|
| Have the result PUT return "what changed" so the page skips the refetch | Standings, bracket, dashboard and round counts are derived server-side from all fixtures (`docs/tournament-rules.md`: the backend owns rankings). A partial payload would mean duplicating that on the client. Steps 1 and 2 make the refetch invisible and cheaper instead. |
| Pagination of Discover | Search and the status grouping are client-side over the whole list. Paging needs server-side search. Not worth it at three tournaments. |

## 4. Decisions already made

Not to be revisited during implementation.

- **No compression middleware.** Cloudflare already does it (measured above).
- **No partial-update response from the result PUT.** Keep the refetch; make it
  non-disruptive (step 1) and cheaper (steps 2 and 4).
- **Preflight cache lifetime: 7200 s** (2 hours, Chrome's ceiling).
- **Poll interval: 20 s**, only while all of these hold: the tab is visible
  (`document.visibilityState === 'visible'`), the tournament is `Ongoing`, no dialog is
  open (score, next round, schedule maker), and the Settings tab is not active. Refresh
  once immediately when the tab becomes visible again.
- **A background refresh never shows the loading skeleton** and never replaces the data
  when nothing changed. Only the first load of a tournament shows it.
- **A failed background refresh keeps the page as it is**, silently for a poll, with
  the existing error toast for a refresh after a save. A failed first load still shows the
  error state.
- **The Discover list keeps its response shape** (grouped by status, same date
  formatting), selects six columns, and is ordered `start_date DESC` like the other two
  list queries.
- **Only GET is retried** on a network failure.

## 5. Non-goals

- Foreign-key indexes. A schema change: High Risk, and not needed at this volume.
- Batching inserts when creating, rebuilding or progressing. Creation is rare; measure
  again before touching it.
- Reducing `updateResult`'s repeated state reads. ~5 ms each in production.
- A "Live · updated 20s ago" indicator. Useful, but UI work of its own; a follow-up.
- Moving hosting closer to South Africa. Neither Render nor Neon offers an African region.
- `SchedulePrint.jsx` behaviour. It must keep working, nothing more.
- Any change to `PAYLOAD_VERSION`, the payload shape or the formatter.

## 6. Steps

### Step 1 — Keep the page on screen while it refetches

> **Done 2026-10-23.** Also made `showMessage` stable (`useCallback` in
> `MessageProvider.jsx`) so the request effect can call it without re-running; that also
> stops Browse refetching its list after every toast. All four Verify checks passed
> locally, plus a simulated failed refetch (page kept, error toast shown).

**Why.** The biggest visible problem in the save loop. Every save blanks the tab and
resets the scorer's filters and scroll (section 3). Fixing it also makes step 5 possible.

**Files.** `tourganiser-ui/src/pages/View.jsx`.

**Do.**
- Show the loading skeleton only when there is no data for the tournament in the URL:
  the first load, or after navigating to a different tournament. When data for the same
  tournament is already held, keep rendering it while the new request runs, then swap in
  the result.
- Keep the existing protection that a slower, older request cannot overwrite a newer one.
- A refetch that fails while data is held: keep the data and show the error as a toast.
  A failed first load keeps today's error state with Retry.
- A session change (`sessionVersion`) must still show the skeleton: the held data
  belongs to the previous viewer, and `creator`/`editor` would be wrong until the refetch
  lands.

**Don't.** Don't move the filter state out of the tabs. Don't change `fetchTournamentData`.
Don't touch `SchedulePrint.jsx`.

**Verify.**
- `npm run lint` shows no new errors for `View.jsx`.
- In the browser, as an organiser on an Ongoing test tournament: set a division filter on
  Fixtures & Schedule, scroll down, enter and save a score. The filter and scroll
  position are unchanged, the row shows the new score, and the skeleton never appears.
- Switch to another tournament: the skeleton appears, not the previous tournament's data.
- Sign out while on the page: the organiser controls disappear and the skeleton shows
  in between.

### Step 2 — Cache CORS preflights

> **Done 2026-10-23.** Test added; `npm test` passes at 100%. A local preflight answers
> `Access-Control-Max-Age: 7200` (checked with curl). The browser-side check could not be
> done in the in-app browser, which re-sends preflights regardless (its network
> instrumentation appears to disable caching). Still to do after deploy, in a normal
> browser with DevTools' "Disable cache" off.

**Why.** Removes one ~220 ms round trip from most writes and from every conditional GET.

**Files.** `api/src/app.js`, `api/test/integration/app.cors.test.js`.

**Do.** Add `maxAge: 7200` to the `cors()` options, with a comment saying what it saves
and that an origin-list change takes up to two hours to reach browsers that already
asked.

**Don't.** Change the origins, methods, headers or credentials settings.

**Verify.**
- A test asserts that a preflight from an allowed origin answers
  `Access-Control-Max-Age: 7200`. `npm test` passes at 100% coverage.
- After deploying: in the browser's Network panel, save two scores within a minute. The
  second save sends no OPTIONS request.

### Step 3 — Trim the Discover list

> **Done 2026-10-23.** Local response 631 bytes (was ~48 KB in production for the same
> three tournaments); six fields, no `schedule` or `created_by`. Groups, cards, search
> and opening a card all checked in the browser. `docs/api.md` updated.

**Why.** It sends every tournament's full schedule plus `created_by`, which nobody reads
and which need not be public. It grows with every tournament.

**Files.** `api/src/repositories/tournament.repository.js`,
`api/test/integration/repositories/tournament.repository.test.js`, `docs/api.md` (the
list endpoint's description), `docs/known-limitations.md`.

**Do.** Select `id, name, start_date, end_date, location, status`, ordered
`start_date DESC`. Leave the service's grouping and date formatting as they are. Update
the repository test's expected SQL. In `docs/api.md`, list the fields the endpoint
returns.

**Don't.** Change the response envelope or the grouping keys. Don't add pagination.

**Verify.**
- `npm test` passes at 100% coverage.
- Discover renders all three groups with names, statuses, locations and dates as
  before; search still filters; a card opens its tournament.
- The response no longer contains `schedule` or `created_by`.

### Step 4 — Answer "nothing changed" before building the payload

> **Done 2026-10-23.** 14 new tests (equivalence in three cases, early 304, fall-through,
> viewer trap, missing tournament, end-to-end headers); 1,514 pass at 100%. Against the
> real database locally: conditional GET 304 in ~188 ms vs ~750 ms for a full 200; a
> saved score produced a 200 with the new result and new ETag, which then got an early
> 304 (so the cheap and full keys agree on real rows); a signed-out request with the
> organiser's ETag got a 200 public payload; a deleted tournament still 404s.
> `docs/api.md` caching section updated.

**Why.** Today a 304 does all the work of a 200. Small saving per request in production
(~25–40 ms), but it's what makes step 5's polling cheap for the database: one light
query per poll instead of about six heavy ones.

**Files.** `api/src/repositories/tournament.repository.js`,
`api/src/services/tournaments.service.js`,
`api/src/controllers/tournaments.controller.js`, and their tests:
`api/test/integration/repositories/tournament.repository.test.js`,
`api/test/unit/services/tournaments.service.test.js`,
`api/test/unit/controllers/tournaments.controller.test.js`,
`api/test/integration/routes/tournaments.route.test.js`. `docs/api.md` (the caching
section).

**Do.**
- Repository: one query returning the tournament's `last_update` and the greatest
  `last_update` among its divisions, or nothing when the tournament does not exist.
- Service: a function that turns that into a change key **with `buildChangeKey`
  itself** (passing the division maximum as a single division), so there is one
  definition of the key, not two.
- Controller: only when the request carries `If-None-Match` and the id is a valid UUID,
  compute the cheap key and the ETag first; on a match answer 304 with the same headers
  the full path sets (`ETag`, `Vary: Cookie`, `Cache-Control: no-cache`). Otherwise fall
  through to today's full path, unchanged. A missing tournament falls through and gets
  the existing 404.

**Don't.** Change `buildChangeKey`, `buildTournamentEtag`, `PAYLOAD_VERSION` or the full
path's behaviour. Don't skip the full path when `If-None-Match` is absent.

**Verify.**
- A test proves the cheap key equals the full build's key for the same rows: tournament
  newer than every division, a division newer than the tournament, no divisions.
- Controller tests: a matching `If-None-Match` returns 304 **without calling the full
  build**; a non-matching or absent one runs the full build; an unknown id still 404s; a
  different viewer never gets a 304 for another viewer's ETag.
- `npm test` passes at 100% coverage.
- In the browser: load a tournament, then reload; the second request is a 304. Save a
  score from another tab or account; the next request is a 200 with the new score.

### Step 5 — Live updates for everyone viewing an Ongoing tournament

> **Done 2026-10-23.** `refreshTournamentData` added beside `fetchTournamentData` (whose
> behaviour is unchanged), with 5 tests; 516 UI tests pass. Browser checks: a result
> saved outside the page appeared after 11 s with no skeleton and the filter kept; with
> the score dialog open 25 s the typed 14–12 survived and no tournament requests were
> made, and polling resumed when it closed; 50 s "hidden" (simulated — the in-app
> browser never reports a background tab as hidden) made no requests and one on return;
> a Finished tournament made none in 26 s; an idle Ongoing page made exactly two
> requests in 42 s, 20 s apart, each a 304 that JavaScript reads as "unchanged".

**Why.** Review priority #4. Spectators and organisers see new results without reloading,
including results entered by editors on other courts.

**Files.** `tourganiser-ui/src/requests.js`, `tourganiser-ui/src/pages/View.jsx`,
`tourganiser-ui/test/tournamentCache.test.js`, `docs/known-limitations.md`,
`docs/future-features.md` (mark "Live view" partly shipped).

**Do.**
- `requests.js`: a way for a caller to learn whether the server answered 304, so a poll
  can leave the page's data alone when nothing changed. Keep `fetchTournamentData`'s
  current behaviour and signature for its existing callers.
- `View.jsx`: poll on the rules in section 4. On "unchanged", do nothing. On "changed",
  replace the data through step 1's path, so there is no skeleton. Stop and restart the
  timer as the conditions change. Clean up the timer and the visibility listener on
  unmount.

**Don't.** Poll while the score dialog, next-round dialog or schedule maker is open, or
on the Settings tab. Don't poll a Not Started or Finished tournament. Don't show a toast
for a failed poll.

**Verify.**
- Unit tests in `tournamentCache.test.js` cover the unchanged and changed answers.
  `npm test` passes.
- In the browser, two sessions on one Ongoing test tournament: a score saved in one
  appears in the other within ~20 s, without a skeleton and without resetting its
  filters.
- With the score dialog open in the second session for over 20 s, typed values are
  never reset, and the Network panel shows no tournament requests until it closes.
- Hide the tab for a minute: no requests while hidden, one immediately on return.
- A Finished tournament makes no polling requests.

### Step 6 — Retry only reads

> **Done 2026-10-23.** 3 tests (POST, PUT, DELETE each fail once, not six times); 519
> UI tests pass.
>
> **Final validation, run 2026-10-23:** API 1,514 tests at 100%; UI 519 tests, lint
> clean apart from the known `main.jsx` false positive, build succeeds;
> `known-limitations.md` Performance updated. The local organiser checks were done step
> by step above. A separate signed-out browser session was not tested, because the in-app
> browser shares one cookie jar; the signed-out paths are covered by the controller and
> route tests and by step 4's anonymous-ETag check. **Still to do after deploy:** the
> production measurements in section 7 and step 2's preflight check. Delete this file
> once those are done.

**Why.** A create, add-division or progression request whose response is lost is
currently retried up to five times and can run twice. Review 5.7.

**Files.** `tourganiser-ui/src/requests.js`, a test in `tourganiser-ui/test/`,
`docs/known-limitations.md`.

**Do.** Retry a network failure only for GET. Any other method throws the existing
connection error on the first failure.

**Don't.** Retry HTTP errors (it already doesn't). Change the delay or the count for GET.

**Verify.** Tests: a GET whose fetch rejects is retried; a POST, PUT and DELETE are not,
and reject with `isConnectionError: true`. `npm test` passes.

## 7. Final validation

Run once, after the last step.

- `api/`: `npm test` passes at 100% coverage.
- `tourganiser-ui/`: `npm test` passes, `npm run lint` shows only the known `main.jsx`
  false positive, `npm run build` succeeds.
- Locally, as organiser and as a signed-out spectator on one Ongoing test tournament:
  scores saved by the organiser appear for the spectator within ~20 s; the organiser's
  filters survive every save; no skeleton after the first load.
- After deploy, repeat the production measurements in section 3:
  - a browser 304 is about one round trip (~250 ms), not two;
  - Discover is a few kilobytes;
  - a score save is the PUT plus one GET, with no OPTIONS within two hours of the first.
- Update `known-limitations.md`, Performance: strike what shipped, record that
  compression is handled by Cloudflare and that the region matches. Delete this file.
