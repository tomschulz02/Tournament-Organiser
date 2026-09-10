# Handover: Schedule Access & Printing (1.0.1 hotfix, batch 5)

## 1. Risk declaration

Risk Level: **Medium** (an access-control change, plus a structural refactor of the
existing print/export rendering — no schema or auth-system changes, but real behaviour
change to who can do what and how printing works for everyone, organiser included).

Nothing here touches the database, dependencies, or `requireAuth`/ownership checks —
this is entirely client-side rendering and one already-public read endpoint. The risk is
in getting the extraction right (the print/export components move out of
`ScheduleMakerModal.jsx` without changing what they render) and in the new mechanism
(rendering a standalone document into a blob URL) working reliably across browsers. This
document is the explanation CLAUDE.md's Medium Risk process requires.

## 2. How to use this document

Read Established Facts and Decisions fully — this touches the same components from two
different angles (who can reach them, and how many courts fit on one printed page), and
both angles land in the same extraction. Do Step 1 (extraction) before Step 2 (court
chunking) before Step 3 (the new access point) — each depends on the shape the previous
step leaves behind.

## 3. Established facts

**The Schedule tab is already visible to everyone — printing is not.**
`tourganiser-ui/src/components/tournament/ScheduleTab.jsx` renders the full day/time/
court breakdown of the schedule unconditionally; `creator` (a prop, `false` for anyone
but the organiser) only gates three things: the "Print All Scoresheets" button, the
"Edit Schedule" button, and per-fixture score-entry actions
(`renderFixtureAction`/`action`). A non-organiser viewing this tab today can already see
every scheduled fixture, in full — there is no separate access problem for the schedule
*view*. What's actually missing is any way for a non-organiser to print or export it:
the only print action anywhere in the app lives inside `ScheduleMakerModal.jsx`, and
that entire modal is gated in `View.jsx`:

```jsx
{scheduleOpen && result.data?.creator && (
	<ScheduleMakerModal ... />
)}
```

`ScheduleMakerModal` is never even mounted for a non-organiser. It also carries a
partially-built `canEdit` read-only mode internally (used to decide whether the fixtures
panel, drag targets, etc. are interactive) — but since the modal itself is never reached
by a non-organiser, that mode is currently unreachable in practice, and per Tom's
instruction this handover does not use it — the ask is explicitly for a *lighter* path
that skips the whole modal, not a read-only version of it.

**Printing today has no PDF step and produces two hidden, always-rendered "export
roots."** `docs/architecture.md` and `utils/scheduleExport.js` confirm: `jsPDF`/
`html2canvas`/`DOMPurify` were removed 2026-08-10. `printSchedule(view)` in
`scheduleExport.js` sets `document.body.dataset.printSchedule = view` and calls
`window.print()`; a print stylesheet in `schedule-maker.css`, keyed on that attribute,
hides everything else and lets the matching export root print. The two export roots
(`type="grid"` and `type="list"`) are rendered by `ScheduleMakerModal.jsx` at all
times while it's mounted, off-screen, and only made visible by the print media query.

**The export rendering is a self-contained cluster of components and helpers, already
inside `ScheduleMakerModal.jsx`.** `ScheduleExportHeader`, `ScheduleExportPages`,
`ScheduleExportGridPages`, `ScheduleExportListPages` (~lines 2052–2214), plus their
supporting constants and functions (`PRINT_LIST_ROWS_PER_PAGE`,
`PRINT_GRID_SLOTS_PER_PAGE`, `chunkList`, and whatever `getEntryRowPlacement`,
`getEntryDivisionStyle`, `getEntryLabel`, `getEntrySecondary`, `getEntryOfficials`,
`buildGridRowTimes` resolve to — grep for each, some may already live in
`scheduleUtils.js` rather than this file). None of these read component state or hooks
from `ScheduleMakerModal` itself beyond the props already being passed down
(`schedule`, `fixturesById`, `tournamentName`, `tournamentId`) — they're pure
presentational components over data already fully assembled by the time they're called.
This is what makes extracting them into their own module tractable.

**The grid export has no court-column limit.** `ScheduleExportGridPages` builds:

```jsx
style={{ gridTemplateColumns: `88px repeat(${schedule.courts.length}, minmax(0, 1fr))` }}
```

— every court in the schedule becomes one column of a single grid table, unconditionally.
A day is already chunked by *time* (rows) across pages via `PRINT_GRID_SLOTS_PER_PAGE`
(a prior handover's fix, now live) but never by *court* (columns) — this is exactly why
6 courts is already tight and 19 is unreadable, per Tom's report.

**Page-break CSS is already confined to `@media print`.** `schedule-maker.css`'s
`.schedule-export-page` and related rules (`break-after: page`, `break-inside: avoid`
etc.) live inside the existing `@media print { ... }` block. Outside of print, these
elements have no forced pagination — they simply flow as ordinary block content. This
matters for the blob-window design below: **the existing CSS, if loaded as-is into a
standalone document, already satisfies "no page breaks on screen, page breaks when
printed"** — nothing new needs to be built for that specific requirement, only the CSS
itself needs to travel with the standalone document (see Step 3).

## 4. Decisions already made

- **One export mechanism, used by both the organiser and everyone else.** Per Tom's
  instruction, the existing in-app "print" action (currently `window.print()` over a
  hidden, always-mounted export root inside `ScheduleMakerModal`) is replaced with the
  same mechanism the new non-organiser access point uses: build the export document,
  open it as a `Blob` URL in a new browser tab/window, and let the browser's own print
  (`Ctrl+P` / the tab's own print control) handle the physical printing from there. This
  also retires the always-mounted hidden export roots and the `data-print-schedule`
  body-attribute mechanism entirely — nothing needs to stay hidden in the DOM waiting
  for a print event once the document is only built on demand.
- **The export components move to their own module**, e.g.
  `tourganiser-ui/src/components/ScheduleExportView.jsx` — not duplicated between
  `ScheduleMakerModal.jsx` and a new standalone entry point. Both the organiser's export
  action and the new non-organiser action call the same function to build the same
  document.
- **The standalone document is a real, separate HTML document, not a portal into the
  live app.** It needs its own `<html><head><style>...</style></head><body>...</body>
  </html>` shell, with the relevant CSS inlined (the `.schedule-export-*` rules and the
  `@media print` block from `schedule-maker.css` — and whatever design tokens they
  depend on, e.g. the accent/identity variables `tournamentAccentStyle` sets inline
  already carry their own values as inline styles, so likely little else is needed, but
  verify by checking what classes `ScheduleExportHeader`/`ScheduleExportGridPages`/
  `ScheduleExportListPages` apply and confirming every one of them is covered by the
  extracted CSS). It is generated once, at the moment "View/Print Schedule" is clicked,
  not kept mounted in the background.
- **The grid export gains a second chunking axis: courts, not just time.** Courts are
  split into groups of **up to 6** (a number inside Tom's suggested 4–6 range — pick 6
  as the ceiling so a 6-court or smaller tournament is completely unaffected, matching
  today's behaviour exactly, and only tournaments past 6 courts get split at all).
  Each court-group produces its own full run of day/time-chunked pages (i.e. court
  chunking is the *outer* loop, time chunking per Established Facts stays the *inner*
  loop) — for a 19-court tournament that's 4 court groups (6/6/6/1), each producing its
  own complete set of day pages. Each such page's header should say which courts it
  covers (e.g. "Courts 1–6") so a printed stack is navigable — extend
  `ScheduleExportHeader` or the page markup around it with this label.
- **The list export is unaffected.** It has no court-column problem — it already prints
  one row per fixture regardless of court count. Only `ScheduleExportGridPages` changes.
- **No auto-print on open.** The new tab shows the document; the reader (organiser or
  not) triggers printing themselves via the browser's own print control. Add a small
  on-page "Print" button to the standalone document itself (calling `window.print()`
  from within that tab) as a convenience, since the tab is a real, separate document
  with no access to the main app's UI to put a button in otherwise.

## 5. Non-goals

- Don't change anything about how a schedule is *edited* — `ScheduleMakerModal`'s board,
  generator, inspector, drag-and-drop, and its own "Create/Edit Schedule" entry point
  stay organiser-only, unchanged, per Tom's explicit "no schedule maker modal" for
  non-organisers.
- Don't build out `ScheduleMakerModal`'s existing `canEdit` read-only mode into a
  reachable non-organiser path — per Decisions, this handover intentionally bypasses
  that mode entirely rather than wiring a second way into it.
- Don't touch scoresheet printing (`Print All Scoresheets`, per-fixture scoresheet
  download) — unrelated mechanism (`pdf-lib` overlay onto a real PDF, not this
  HTML/print-dialog mechanism), out of scope here.
- Don't change the schedule tab's filters, grouping, or on-screen layout — this is about
  the print/export path only.

## 6. Numbered steps

### Step 1 — Extract the export rendering into its own module

**Why:** both the organiser's export action and the new non-organiser action need to
build the same document from the same code, not two copies of it.

**Files:** new file `tourganiser-ui/src/components/ScheduleExportView.jsx` (name is a
suggestion, not required); `tourganiser-ui/src/components/ScheduleMakerModal.jsx`.

**Do:**
- Move `ScheduleExportHeader`, `ScheduleExportPages`, `ScheduleExportGridPages`,
  `ScheduleExportListPages`, `chunkList`, `PRINT_LIST_ROWS_PER_PAGE`,
  `PRINT_GRID_SLOTS_PER_PAGE`, and any other helper each of them calls that isn't
  already exported from `scheduleUtils.js` or another shared module, into the new file.
  Import what's needed back into `ScheduleMakerModal.jsx` (it still needs
  `ScheduleExportPages` for its own export action).
- Confirm nothing left behind in `ScheduleMakerModal.jsx` still references these by
  accident (a stale import, a leftover reference) — the file is large; grep for each
  moved name after the move.

**Don't:** don't change what any of these components render yet — this step is a pure
move, verified by the export looking pixel-identical to before it. Behavioural changes
(court chunking, the new document shell) are Steps 2 and 3.

**Verify:** the organiser's existing print/export action (however it's currently
triggered — this step doesn't change that trigger yet, only where the rendering code
lives) produces output identical to before the move, for both grid and list views.

### Step 2 — Chunk the grid export by court

**Why:** per Established Facts, `ScheduleExportGridPages` puts every court in one row of
columns with no limit — unreadable past a handful of courts.

**Files:** `ScheduleExportView.jsx` (post-Step-1 location).

**Do:**
- Add a court-group chunking pass: split `schedule.courts` into arrays of at most 6,
  preserving court order.
- Restructure `ScheduleExportGridPages` (or wrap it) so the existing day/time-chunk
  logic runs once per court group, each time building its grid table against only that
  group's courts (the `gridTemplateColumns` count and the `schedule.courts.map(...)`
  header/body loops both need to iterate the court group, not the full `schedule.courts`
  array) rather than against the whole court list.
- Label each resulting page with which courts it covers, per the Decision above —
  extend `ScheduleExportHeader`'s props (or add a sibling label) to carry something
  like `courtRangeLabel`.
- Entry placement (`getEntryRowPlacement`, the `entries.find(...)` lookups matching
  `item.entry.courtId === court.id`) should need no change beyond iterating the smaller
  per-group court list — an entry on a court outside the current group simply doesn't
  match any cell in that group's table, which is exactly correct (it belongs to a
  different group's pages).

**Don't:** don't change the list export, the time-chunking logic itself, or anything
about how an individual entry is rendered inside a cell.

**Verify:**
- A schedule with 6 or fewer courts produces byte-for-byte the same pages as before this
  step (single court group, no visible change).
- A schedule with, say, 19 courts produces multiple court groups (e.g. 4, at 6/6/6/1),
  each with its own complete set of day/time pages, correctly labelled, with every
  fixture appearing exactly once across the whole output (nothing duplicated, nothing
  dropped) — spot-check a few fixtures on courts in different groups.
- Print (or Save-as-PDF) the 19-court case and confirm each page is now actually
  readable — this is the entire point of the change, verify it visually, not just
  structurally.

### Step 3 — Build the standalone document and wire up both entry points

**Why:** per Decisions, both the organiser and non-organiser print/view actions need to
open the same self-contained document in a new tab, rather than printing from within the
live app.

**Files:** `ScheduleExportView.jsx` or a new small utility module alongside it (e.g.
`utils/scheduleExportDocument.js`), `ScheduleMakerModal.jsx`,
`tourganiser-ui/src/components/tournament/ScheduleTab.jsx`, `docs/architecture.md`
(note the retired `data-print-schedule` mechanism if that section still describes it).

**Do:**
- Write a function that, given `schedule`, `fixturesById`, `tournamentName`,
  `tournamentId`, and `type` (`'grid'` | `'list'`), renders `ScheduleExportPages` to a
  static HTML string (`react-dom/server`'s `renderToStaticMarkup` is the standard tool
  for this — confirm it's already a dependency or a safe addition, it ships as part of
  `react-dom`, already a dependency, so this should not need a new package) and wraps it
  in a full HTML document shell with the relevant CSS inlined as a `<style>` tag.
  Pulling the raw CSS text: Vite supports importing a stylesheet's raw contents with a
  `?raw` suffix on the import path (or extract just the needed rules into their own
  small `.css` file and import that raw) — use whichever keeps the inlined CSS scoped to
  only what these components need, rather than the entire `schedule-maker.css`, which
  carries a lot of unrelated modal-chrome styling that would be dead weight (and could
  visually conflict) in a bare document.
- Add the on-page Print button (per Decisions) into the same generated markup, wired to
  call `window.print()` in that document's own context.
- Turn the resulting HTML string into a `Blob` (`type: 'text/html'`),
  `URL.createObjectURL(blob)`, and `window.open(url, '_blank')`. Revoke the object URL
  on a reasonable trigger (the opened window's `unload`, or simply after a short delay)
  so it doesn't leak — check what's idiomatic for this codebase's other blob/URL usage,
  if any exists, otherwise a straightforward `setTimeout(() => URL.revokeObjectURL(url),
  ...)` after opening is a standard, acceptable pattern.
- In `ScheduleMakerModal.jsx`, change the organiser's existing print trigger
  (`handlePrint`, per Established Facts) to call this new function instead of
  `printSchedule`/`window.print()`. Remove the now-unused hidden export roots and the
  `data-print-schedule` mechanism (`utils/scheduleExport.js`'s `printSchedule` function
  and its call sites) once nothing references them — don't leave dead code behind.
- In `ScheduleTab.jsx`, add a "View / Print Schedule" button, visible **unconditionally**
  (not gated by `creator`) — per Established Facts, this tab already only renders once
  `tournament.schedule` exists, which already satisfies "only once there is a schedule"
  with no extra check needed. Offer both grid and list, matching whatever choice the
  organiser's own export action offers today (two buttons, or one control with a
  type choice — match the existing UI pattern for this rather than inventing a new one).

**Don't:**
- Don't gate the new button on `creator` — the entire point is that it's for everyone.
- Don't remove the organiser's "Edit Schedule" button or change what it does — it still
  opens the full `ScheduleMakerModal`, unrelated to this new action.
- Don't try to keep the old `printSchedule`/`data-print-schedule` mechanism around
  "just in case" — per the Established Facts constraint on dead code
  (`docs/known-limitations.md`'s own caution about code that looks alive), verify
  nothing else references it before deleting, then delete it.

**Verify:**
- As the organiser, trigger the (now blob-based) print/export action from inside
  `ScheduleMakerModal` — a new tab opens with the correctly rendered document; printing
  or Save-as-PDF from that tab produces the same paginated output Step 2 verified.
- As a non-organiser (or signed out), open a tournament with a schedule — the new
  View/Print Schedule button is visible on the Schedule tab; clicking it opens the same
  kind of standalone document in a new tab, without ever loading `ScheduleMakerModal`
  (confirm via the network/JS tab that the modal's lazy chunk is not fetched for this
  path).
- A tournament with no schedule yet shows no such button anywhere (organiser or not) —
  confirm the tab this lives on genuinely only renders once a schedule exists, per
  Established Facts, rather than assuming.
- The standalone document, viewed on screen, shows continuous content with no forced
  page breaks (scrolling reveals every day/page back to back); printing it (or
  Save-as-PDF) shows the same page-per-chunk breaks as before this change.
- The on-page Print button in the new tab works.

## 7. Final validation

- `npm run lint` from `tourganiser-ui/` — confirm the pre-existing error count (5) has
  not grown.
- `npm run build` — confirm it still succeeds, and check the built output for the new
  chunk/module boundaries make sense (the export module shouldn't accidentally pull the
  whole `ScheduleMakerModal` lazy chunk into the main bundle, or vice versa — confirm the
  Schedule tab's new button doesn't itself trigger a load of `ScheduleMakerModal`).
- Walk every step's Verify list once more end to end, on a tournament with more than 6
  courts and more than one day, as both the organiser and a signed-out visitor.
