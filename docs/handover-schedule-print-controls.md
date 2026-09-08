# Handover: Configurable Schedule Print Layout — completion record

**Status, 2026-09-08: all six steps implemented. What remains is the manual walkthrough in
section 6.** Delete this document once that passes — the durable record is `docs/schedule.md`'s
`print` key documentation and `docs/architecture.md`'s print section, both already updated.

This is not the original specification. That document was written and approved separately and
is not re-transcribed here, because the work it describes is done and re-stating a completed
specification alongside the standing docs that now carry the same facts is the drift
`CLAUDE.md` warns about. What follows is what a reader needs *now*: what was approved, what
was built where, what deviated, and what is still untested.

## 1. Risk declaration

Medium-High, and approved by Tom on 2026-09-08 for all of it, including routing. Four things
pushed it above Low:

- A new top-level `print` key in the `tournaments.schedule` JSONB contract — a shared
  data-shape change, and `CLAUDE.md` categorises "scheduling" as Medium.
- Replacement of the shared page-chunking logic every viewer's print path runs through, not
  just the organiser's.
- A new top-level route, which is routing, and its own approval line.
- Changes to `ScheduleMakerModal.jsx`, an existing actively-used Medium-risk surface.

## 2. Decisions, as settled and as built

- Only the organiser edits and saves page breaks. Viewers get the saved result, or the smart
  default where nothing is saved.
- Interaction is click-a-gutter-to-toggle — rows for both layouts, columns for the grid. Not
  drag-to-resize.
- A smart default is always computed first; editing starts from a finished arrangement, never
  from blank. The first click materialises the default into an explicit saved layout.
- Grid and list are saved independently, each carrying its own orientation and (grid only)
  column grouping, so switching type always shows something finished.
- A layout's orientation and its breaks are one unit. Viewers pick a layout, not an
  orientation.
- One "View/Print Schedule" link on `ScheduleTab`; grid/list moved onto the print page.
- The route sits outside the `App` shell and needs no login.
- The `print` key is stored as given. **No server-side validation was added**, on Tom's call,
  matching how `settings`, `days` and `version` are already handled per `docs/schedule.md`'s
  "free text, and merely stored" list. No file under `api/` was touched by this work at all.
- `ScheduleMakerModal`'s two print actions became one, "Edit Print Layout", reusing the
  existing `panelMode` mechanism rather than navigating. It stages into the modal's own
  `schedule.print` and commits through the modal's normal save flow — no network call of its
  own.

## 3. Non-goals, respected

- No reordering of non-adjacent courts into one column group — breaks express contiguous
  grouping only.
- No two days sharing one physical page. A day still always starts a new page.
- No change to scoresheet printing.
- No mobile tuning of the edit UI beyond keeping it from breaking.

## 4. What was built, and where

| File | What changed |
|---|---|
| `tourganiser-ui/src/utils/scheduleUtils.js` | `DEFAULT_PRINT_ORIENTATION`; `normalisePrintLayouts` / `serialisePrintLayouts` wired into `buildEmptySchedule`, `normaliseSchedule` and `serialiseScheduleForSave`; `chunkAtBreaks`, `computeSmartDefaultRowBreaks`, `computeSmartDefaultCourtBreaks`, `courtBreakIndices`, `pruneStalePrintLayout`. |
| `tourganiser-ui/src/utils/schedulePrintLayout.js` | **New.** Page sizes (`PRINT_LIST_ROWS_PER_PAGE`, `PRINT_GRID_SLOTS_PER_PAGE`, `COURTS_PER_GROUP`), the natural-break tests, `resolveRowBreaks` / `resolveCourtBreaks`, `getPrintRowsForDay`, `getPageStartRows`, `materialisePrintLayout`. |
| `tourganiser-ui/src/components/ScheduleExportView.jsx` | Chunks at explicit break positions instead of a fixed size; takes a `layout` prop; the non-component helpers moved out (see deviation 2). |
| `tourganiser-ui/src/components/SchedulePrintLayoutEditor.jsx` | **New.** The one editor, used by both surfaces. Reads `(type, schedule, fixturesById, layout, onChange)` and nothing else. |
| `tourganiser-ui/src/pages/SchedulePrint.jsx` | **New.** The route page: its own fetch, grid/list toggle, organiser-gated edit mode, Save, Print, staleness notice. |
| `tourganiser-ui/src/styles/schedule-print.css` | **New.** Route chrome and editor styling. Every rule here is hidden by its own `@media print` block or belongs to a control that is. |
| `tourganiser-ui/src/main.jsx` | The route, as a sibling of `/login`. |
| `tourganiser-ui/src/components/tournament/ScheduleTab.jsx` | Two buttons became one `Link`; the now-unused export plumbing removed. |
| `tourganiser-ui/src/components/ScheduleMakerModal.jsx` | `setPrintLayouts` reducer case; `print-grid`/`print-list` consolidated into `print-layout`; the new `PrintLayoutPanel`; `handlePrint` now passes the staged layout. |
| `tourganiser-ui/src/utils/scheduleExportDocument.jsx` | Takes and honours a `layout`, including its orientation. **Retained permanently** for the modal — see below. |
| `tourganiser-ui/vitest.config.js`, `test/schedulePrintLayout.test.js`, `test/scheduleUtils.test.js` | 44 new cases; the existing serialise-key-order test updated for the new key. |
| `docs/schedule.md`, `docs/architecture.md` | The durable record. |

**`utils/scheduleExportDocument.jsx` is not dead code and must not be deleted.** The live route
no longer needs it, but `ScheduleMakerModal` does, permanently: the modal is a full-screen
overlay rather than a clean print surface, and the schedule being printed there may not be
saved yet, so there is nothing at the route to print. Popping out to a Blob document is what
makes both true at once.

## 5. Deviations from the approved specification

Two, both deliberate.

1. **Step 3's "printed output is unchanged" Verify line cannot hold alongside the natural-gap
   refinement the same step asks for.** The refinement moves a break up to two rows *earlier*
   than the fixed size when that ends a grid page on an empty slot row, or avoids splitting a
   run of simultaneous fixtures on the list. That is a visible change to where some pages break
   on a schedule nobody has arranged — which is the point of it. The search only ever moves a
   break earlier and never past the estimate, so a page is never longer than before and the
   page count usually does not move. The refinement was kept; that Verify line is superseded.
2. **The break-position logic lives in `utils/schedulePrintLayout.js`, not in
   `ScheduleExportView.jsx`** as Step 3 says. Three components read it, and
   `react-refresh/only-export-components` forbids a file from exporting both components and the
   plain functions they share — keeping it in `ScheduleExportView.jsx` added six lint errors
   over the pre-existing baseline of five. The new module is pure, and is the reason the logic
   could be unit-tested at all.

One thing worth knowing that is not a deviation: `ScheduleMakerModal`'s "Edit Print Layout"
action is not gated on `canEdit`, exactly as the two print actions it replaces were not. The
modal is never mounted for a non-organiser (`View.jsx` gates it on `result.data?.creator`), so
that mode is unreachable, and edits made in the panel stage into local state that only the
`canEdit`-gated save flow can persist. If the modal is ever opened read-only, gate the editor
and leave the Print button.

## 6. What is left: manual validation

Automated checks are done and passing:

- `npm run lint` — 5 errors, unchanged from the pre-existing baseline (ThemeContext ×2,
  ConfirmDialog, ScoreUpdateModal, main.jsx).
- `npm run build` — succeeds. `scheduleExportDocument` is still its own 188 kB chunk and
  `ScheduleMakerModal` its own 42.9 kB one; the Schedule tab's link loads neither.
- `npm test` — 440 passing across 8 files.

The manual walkthrough has **not** been run. It needs a real tournament with more than six
courts and a multi-day schedule long enough to span several pages per day. See the checklist
handed over with this work; the essentials are:

- Organiser on the live route: edit and save grid and list independently; page-count indicator
  agrees with printed output; headers repeat on every physical page; Reset restores the smart
  default; Save then reload persists.
- Organiser in `ScheduleMakerModal`: stage breaks, Print, confirm the Blob tab reflects them;
  commit the schedule; confirm the live route shows the same breaks as its saved layout.
- Logged out, direct link: saved layouts shown, printable, no edit affordance reachable.
- Print while in edit mode: gutters and toolbar must not reach the paper.
- Staleness: remove a court or day after saving a layout, reopen both surfaces — no crash, a
  sensible fallback, and the notice shown once to the organiser only.
