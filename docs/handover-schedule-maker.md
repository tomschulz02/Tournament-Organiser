# Handover: Schedule maker as a calendar

Make the schedule behave like Google Calendar. Grid lines are a reading aid, a match
occupies exactly the time it takes, on the board and on paper, and the options become
simpler and live in one place each.

Working reference, private to the owner: the
[redesign prototype](https://claude.ai/artifact/7UvTeQZoBhNNrpf4xd9Vjd). It shows the
intended board, print output and option sheets. Where it and this document disagree, this
document wins.

## 1. Risk declaration

**Risk Level: Medium overall, with High Risk items.** This document is the explanation the
Medium and High Risk process in `CLAUDE.md` requires. Approving it approves the changes it
lists and nothing beyond them.

| Level | What | Specific risk |
|---|---|---|
| Medium | Printed grid rewritten (step 1) | Real tournaments print from this. A wrong scale clips text or overflows a sheet, and the fault only shows on paper. |
| Medium | Placement rules (step 2) | The fixed cell targets are replaced in a 2,900-line component with no component tests. Every drag path changes. |
| Medium | Shared logic in `scheduleUtils.js` and `schedulePrintLayout.js` | The board, the print route, the standalone print document and the page-break editor all read it. |
| Medium | Stored settings used differently (step 3) | `settings.generator` starts being written by Set up as well as by the generator. The JSONB shape is unchanged, but its documented meaning changes. |
| High | Deleting code | `getBusiestCell`, the per-row cell targets, the inspector and its panels. Each is replaced in the step that removes it. |
| High | Reversing recorded decisions | `docs/decisions.md` and `docs/schedule.md` say the printed grid is deliberately not continuous. Step 1 reverses that, as the owner asked. |

No schema change, API change, dependency, routing change or authentication change is
involved. If a step appears to need one, stop and ask.

## 2. How to use this document

- Do **one step per session**, in order. Each step leaves the application working and can
  ship alone.
- Do not re-inspect anything section 3 already states. Check a line number only if the code
  around it has moved.
- Read only the files a step names.
- Run each step's Verify. Run section 7 once, at the very end, and not after every step.
- Do not commit, stage or run git. See `CLAUDE.md`.
- Line numbers were correct on 2026-11-04 and will drift. Trust the function name over the
  number.

## 3. Established facts

### Stack and testing

- The UI suite (`npm test` in `tourganiser-ui/`) covers pure modules only. Nothing tests
  `ScheduleMakerModal.jsx` or `ScheduleExportView.jsx`, so new rules belong in pure functions
  with tests, and components are verified in a browser.
- `VITE_API_URL` is `http://localhost:3000/api/`. The local API must be running to reach the
  maker. Check where `api/.env` points before starting it, and never test against production
  data.
- PDF output can be checked without a print dialog:
  `msedge --headless=new --print-to-pdf=out.pdf <url>`.

### The data already supports this

- Every entry stores its own `startTime` and `endTime`, on any minute. No field ties an entry
  to a grid line.
- `settings.slotMinutes` is documented as how the board is ruled, never how long a match is
  (`docs/schedule.md`). The generator stopped writing it on 2026-09-10.
- The server accepts off-grid times and rejects only court clashes, team clashes, round-order
  breaches and court division breaches. Its codes are `SCHEDULE_COURT_CLASH`,
  `SCHEDULE_TEAM_CLASH`, `SCHEDULE_ROUND_ORDER` and `SCHEDULE_COURT_DIVISION`.
- `settings`, `days` and `print` are stored as given and not validated.

### Where the slot thinking still lives

| Symptom | Cause | Where |
|---|---|---|
| A match prints only in its first row, and later rows look free | Each entry goes in the one cell matching `rowStart`. `rowSpan` is computed and used only for page breaks. | `ScheduleExportView.jsx:206` |
| A break prints once per court per row | `spanningBreak` is rendered inside every cell | `ScheduleExportView.jsx:209`, `:218` |
| Entries outside the day's hours vanish from the printed grid | `getGridRowsForDay` filters on `inDay`. The list view still prints them. | `schedulePrintLayout.js:57` |
| The page-break editor shows one entry per cell and treats continuing rows as empty | `GridPreviewRow` uses `find` on `rowStart` | `SchedulePrintLayoutEditor.jsx:271` |
| Hand-placed matches are one slot long | `createSlotDraft` adds `slotMinutes` | `ScheduleMakerModal.jsx:154`, `:685`, `:711` |
| A drop lands on the row's time | The cell's `onDrop` passes that row's `time` | `ScheduleMakerModal.jsx:671`, `:2045` |
| A part-filled row refuses everything | Any overlap adds the row to `occupiedSlots` and `dropBlockedSlots` | `ScheduleMakerModal.jsx:1658`, `:2034`, `:2043` |
| Drag-to-create starts at the row's top | `beginCreate` anchors to `rowIndex * slotMinutes` | `ScheduleMakerModal.jsx:1913` |
| Slot length also zooms the board | `GRID_ROW_HEIGHT` is 84px whatever the slot is | `ScheduleMakerModal.jsx:1517`, `:1958` |
| Team clashes surface only on save | `validateScheduleEntry` checks court overlap only | `scheduleUtils.js:688` |

### The print pipeline

- One renderer, `ScheduleExportPages` in `ScheduleExportView.jsx`, serves both print paths.
  The route `/tournaments/view/:id/print` is `SchedulePrint.jsx`. The maker's print uses a Blob
  document from `utils/scheduleExportDocument.jsx`, which inlines `schedule-export.css` as raw
  text.
- So `schedule-export.css` must stay self-contained. App tokens are not loaded there except
  those it declares itself.
- `@page` is A4 landscape with a 10mm margin, or A4 portrait with a 12mm margin. It is set in
  both `scheduleExportDocument.jsx` and `SchedulePrint.jsx`. A saved layout's orientation wins.
- A page is `.schedule-export-page` with 32px padding, a header, then the grid. Estimated
  height left for the time grid, with a compact header and no page padding in print, measured
  against PDFs in step 1: **145mm landscape and 228mm portrait** (`PRINT_GRID_HEIGHT_MM`).
- Backgrounds and box shadows may not print. The existing CSS uses a real
  `border-left: 3px solid var(--tv-division-color)` for that reason. Any division colour that
  must survive printing has to be a real border.
- `schedule-print.css:648-727` is the phone layout of the print route: a minimum column width,
  a scroll container, a sticky header and a sticky time column. It targets
  `.schedule-export-grid-table`, `-grid-head` and `-grid-time`, so changes to that markup must
  keep these working.
- Saved layouts store `rowBreaksByDay` as grid row indices and `courtBreaks` as court ids.
  A row index only means a time for a given `slotMinutes`. Changing the grid already moves
  saved breaks. An index past the end is ignored.
- Current defaults: `PRINT_GRID_SLOTS_PER_PAGE = 7`, divided by `getBusiestCell`. Tests that
  pin these sit in `test/schedulePrintLayout.test.js:264`, `:281` and `:292`.

### The maker

- **Shell:** its own portal and focus trap (`handleKeyDown`, `:392`), not `CreateModal`.
  Escape closes the overflow menu first, then the modal.
- **Layout:** `280px | board | 320px` (`schedule-maker.css:406`). Breakpoints are 1200px,
  900px and 768px. Below 900px one panel shows at a time through
  Fixtures / Board / Inspector tabs. At 768px and below, it opens on the list view
  (`getDefaultViewMode`).
- **Right column:** `panelMode` swaps between `overview`, `entry`, `generate`, `break`, `slot`,
  `court`, `print-layout` and `settings` (`:1407`).
- **State:** `useReducer(scheduleReducer)` with actions `reset`, `replace`, `updateSettings`,
  `setCourts`, `setDays`, `setPrintLayouts`, `upsertEntry`, `removeEntry`. `markDirty()` is
  called by hand after each. Every placement path validates with `validateScheduleEntry`.
- **Two kinds of drag, keep both:** the sidebar drag and the block move use HTML5
  drag-and-drop. Create and resize use pointer events with auto-scroll.
- **`dataTransfer.getData` returns nothing during `dragover`.** Only `drop` can read it. A
  live preview must get the dragged item from React state set in `onDragStart`.
  `draggingEntryId` already does this for moves. There is no fixture equivalent yet.
- **Touch:** HTML5 drag does not work. Phones use tap to place via `pendingFixtureId`. Resize
  handles do accept touch, through `touch-action: none`.
- `SNAP_MINUTES` is 5. `snapToIncrement` exists. `getEntryDayPlacement` gives minute offsets.
- `DESIGN.md` calls for 44px tap targets. Resize handles are the documented exception.

### Reusable code

| Need | Exists as |
|---|---|
| A fixture's round for lengths | `roundHolding` exported from `components/tournament/fixtureUtils.js`. `scheduleGenerator.js:65` has a private copy. |
| Team keys that ignore unbound slots | `getTeams` and `getTeamKey`, private in `scheduleGenerator.js:88` |
| Match length and round lengths | `settings.generator.fixtureDurationMinutes` and `.roundDurations` |
| Reading those safely | `normaliseGeneratorSettings`, `DEFAULT_GENERATOR_SETTINGS` |
| Round names with fixtures | `generatorRounds` memo in the modal, `:338` |
| Court list from a count | `buildCourtList`. The generator requires `courtCount`. |
| Generator report | `GenerationReport`, `highlightOffendingEntries` |
| Division colour on an entry | `getEntryDivisionStyle` |
| Confirmation | `useConfirm` |
| Tooltip on a rule | `Tooltip`, used by `GeneratorOption` |

### Generator inputs

`generateAutomaticSchedule` takes `courtCount`, `dailyStartTime`, `dailyEndTime` and
`fixtureDurationMinutes` as arguments and writes the hours back to `settings`. Today these
come from the panel's own draft (`handleGenerateSchedule`, `:925`). It replaces every placed
fixture and keeps breaks and each fixture's officials and notes.

### What the data can't support

| Asked for | Reality | So |
|---|---|---|
| Rest warnings on unbound knockout fixtures | Teams are unknown until the round before is played | No warning. `getTeamKey` returns null for these. |
| Different hours per day | One `dayStartTime` and `dayEndTime` for all days | Hours apply to every day |
| A remembered length for one fixture once unscheduled | Length lives on the entry, which is deleted | Returns to its round's length |
| Live round-order feedback | Only the generator and server implement it | Stays a save-time error with highlighting |
| A guaranteed one-page day | Depends on hours, courts, shortest match and text wrapping | A target, not a promise. The default adds a page before clipping. |

## 4. Decisions already made

Settled. Do not revisit.

1. **Two matches may not overlap on one court.** A court hosts one match at a time. The server
   rule stays. No side-by-side layout is needed.
2. **The printed grid becomes continuous.** This reverses the note at `docs/schedule.md:181` and
   the line at `docs/decisions.md:780`.
3. **Entries keep their own length.** Match length is a default for new placements, never a
   constraint. Editing it moves nothing already on the board. This is why it doesn't repeat the
   coupling `docs/decisions.md:773` rejected.
4. **Stored in the existing keys.** Match lengths stay at `settings.generator`, so nothing new
   is added to the JSONB.
5. **Auto-schedule still replaces placed fixtures.** Keeping hand placements is a later piece
   of work.
6. **Fixed board scale:** `PX_PER_MINUTE = 1.6`. A 50-minute match is 80px and a 25-minute match
   is 40px.
7. **Snap:** 5 minutes as now, plus a snap to a neighbouring entry within 7 minutes.
8. **Grid line choices:** 15, 30 and 60 minutes. A saved value outside these, such as HST's 50,
   stays selectable until changed.
9. **Back-to-back warning:** an amber warning when a team's gap is under 15 minutes. It warns
   and never refuses. It is unrelated to the generator's minimum rest.
10. **Names:** Generate becomes **Auto-schedule**. Slot Length becomes **Grid lines every**.
    Inspector, entry and slot disappear from the interface. Grid and List toggles become
    labelled **Board** and **List**.
11. **Default rules in view:** Minimum rest, Break before knockout rounds, Bend rules to fit
    every fixture, Assign officials automatically. The other six go under **More rules**.
12. **A saved print layout always fits its sheet.** The scale shrinks to fit and text drops a
    tier. The default page breaks use a minimum scale, so this only affects layouts an organiser
    chose.

## 5. Non-goals

- Changing the generator's algorithm or rules.
- Keeping hand placements during Auto-schedule.
- Client-side round-order checks.
- Different hours per day, or a length per fixture stored separately from its entry.
- Changing the Fixtures & Schedule tab (`ScheduleTab.jsx`) or the printed **List** view. Both
  already show real times. The list's page overflow was fixed separately on 2026-11-04, after step 2.
- Moving the maker onto `CreateModal`.
- Replacing HTML5 drag-and-drop with pointer events.
- Removing `getEntrySlotSpan` or `buildTimeSlots`, which are recorded as dead in
  `known-limitations.md` but aren't part of this work.
- The dead `team-card*` and `fixtures-doc` CSS.
- Any change under `api/`.

## 6. Steps

### Step 1: Print to scale

**Done 2026-11-04.** Kept here until the document is retired, because later steps read the facts it
settled: `MIN_MM_PER_MINUTE` is 0.26, and `getGridRowsForDay` returns both minute offsets and rows.

**Why here:** it fixes the reported bug, stands alone, and touches nothing in the maker.

**Files:** `components/ScheduleExportView.jsx`, `components/SchedulePrintLayoutEditor.jsx`,
`utils/schedulePrintLayout.js`, `utils/scheduleUtils.js` (comment only), `styles/schedule-export.css`,
`styles/schedule-print.css`, `test/schedulePrintLayout.test.js`, `docs/schedule.md`,
`docs/decisions.md`, `docs/known-limitations.md`.

**Do:**

- Replace the row-and-cell grid with a time-scaled one. Keep the header row of court names. Below
  it, a time gutter and one column per court in a group, each a positioned container. Draw each
  entry at its own start and length, in `mm`, so screen and paper agree.
- Draw grid lines at `slotMinutes` and label them in the gutter.
- Show each block's start and end time, its teams, and its secondary line. Officials stay. Choose
  what fits from the block's height: full, then time and teams, then teams alone. Text must never
  overlap a neighbouring block.
- Draw an all-courts break once, as one band across that group's columns. A one-court break sits in
  its column.
- Use real borders for the division colour, so it prints.
- Page breaks stay at grid lines. A page covers a run of grid rows, so saved layouts keep their
  meaning.
- A match crossing a page break appears on both pages, clipped to each page's time range. The later
  page marks it as continued.
- Add a pure scale function to `schedulePrintLayout.js`. Use a page's usable height for its
  orientation and the longest page's minutes. The same scale applies to every page of a day, so a
  match is the same height throughout.
- Default page breaks: the row budget comes from a minimum scale (start at about 0.28mm per minute,
  which gives a 50-minute match about 14mm) and the shortest match on the day. Replace
  `getBusiestCell`, which no longer means anything.
- Change the natural break test: a break before a row is natural when no entry crosses that line.
- List entries outside the day's hours beneath the last grid of that day, with their real times, so
  they no longer vanish.
- Update `GridPreviewRow` so a continuing match reads as in use, and the count of courts in use is
  right.
- Keep `.schedule-export-grid-table`, `-grid-head` and `-grid-time` working for the phone rules, or
  move those rules with the change.
- Rewrite the note at `docs/schedule.md:181` and add a `docs/decisions.md` entry that reverses the
  earlier decision and says why. Correct the matching line in `known-limitations.md` and the comment
  above `getEntryRowPlacement`.

**Don't:**

- Change the List view or the stored `print` format.
- Rely on background colour or box shadow for anything that must print.
- Reference an app token in `schedule-export.css` that the file doesn't declare.
- Change the board.

**Verify:**

- Unit tests: scale function, default breaks with long and short matches, natural break crossing,
  and existing saved layouts resolving to the same page row ranges.
- PDF, both orientations, on a schedule with 25, 50, 75 and 90-minute matches on a 60-minute grid:
  - no court in use looks free;
  - two matches in one hour both show at their real times;
  - Lunch appears once;
  - no text is clipped or overlapping;
  - a page break through a match shows it on both pages.
- A saved layout with no breaks fits one sheet.
- Six courts in one group stay legible. Seven courts split into two groups as before.
- `/print` at 375px keeps the time column and header locked while scrolling.
- Black and white print: every block is distinguishable and its division is named.
- The page-break editor still adds and removes breaks, and the page count matches the PDF.

### Step 2: Placement follows the pointer

**Done 2026-11-04.** Later steps can rely on: `getFixtureDefaultLength`, `getPlacementProblem`,
`snapToNeighbour` and `findNextFreeStart` in `scheduleUtils.js`; `validateScheduleEntry` taking
`fixturesById` as its fourth argument; `createSlotDraft` drafts with an empty `endTime` meaning "about
here", which `resolveDraftTimes` turns into real times. An HTML5 drag can't be started by the in-app
browser's mouse tool, so test those with dispatched `DragEvent`s, or by hand in a real browser.

**Why here:** this is the calendar behaviour on the board. It depends on nothing in the layout steps,
which then build on it.

**Files:** `components/ScheduleMakerModal.jsx`, `utils/scheduleUtils.js`, `utils/scheduleGenerator.js`,
`styles/schedule-maker.css`, `test/scheduleUtils.test.js`, `docs/schedule.md`, `helpContent.js`.

**Do:**

- Add tested pure functions in `scheduleUtils.js`:
  - the default length of a fixture, from `roundDurations`, then `fixtureDurationMinutes`, then
    `slotMinutes`;
  - snapping a start to a neighbour within 7 minutes, choosing the nearest;
  - the first free start at or after a time on a court;
  - team conflict and back-to-back detection, returning a plain reason such as "DSJ is playing on
    Court 1 until 14:15".
- Move `getTeams` and `getTeamKey` from `scheduleGenerator.js` to `scheduleUtils.js` and import them
  back, because the generator already imports from there. Don't change their behaviour.
- Add the team check to `validateScheduleEntry`, passing fixtures. It refuses only what the server
  would refuse on save. Include the same reason text for court clashes and breaks.
- Replace the per-row cells with one column per court that draws its lines as a background. Set the
  board scale with `PX_PER_MINUTE`, so changing the grid redraws lines and moves nothing.
- Make the whole empty column the target. Read the minute from the pointer for drag, drop, tap and
  drag-to-create. Remove `occupiedSlots`, `dropBlockedSlots` and the row anchor in `beginCreate`.
- A move keeps the grab offset, so the block doesn't jump to the pointer.
- During drag, show a preview at the true time and length. Add a chip by the pointer with the times
  and any reason. Blue when fine, amber for a warning, red when refused. Store the dragged fixture in
  state at `onDragStart`.
- Outline the other matches of the same teams during a drag.
- New placements take the fixture's default length. A drag-to-create range keeps its drawn length, so
  the draft must record which it is.
- Tap to place: use the tapped minute. If that time is busy, use the next free start on that court,
  and say so if there is none.
- Adjust the compact block tiers to the new heights.
- A refused drop changes nothing and the reason stays visible in the status message.
- Update the Board section in `helpContent.js` and the board paragraph in `docs/schedule.md`.

**Don't:**

- Replace HTML5 drag-and-drop.
- Take touch drags from scrolling the board.
- Add rules beyond team, court, break and hours.
- Change the toolbar or panels.

**Verify:**

- Unit tests for each new function, including unbound knockout fixtures constraining nothing and
  `TBD` never clashing.
- Generator tests still pass unchanged after the move.
- On a 60-minute grid: drop at 10:15 and it lands at 10:15; two 25-minute matches fit in one hour;
  the free part of a part-filled hour accepts a drop, a tap and a drag-to-create.
- A match dropped from the list takes its round's length.
- A drop near a neighbour butts against it.
- A team clash shows its reason during the drag, and the drop changes nothing.
- Changing the grid from 60 to 15 moves no block.
- Auto-scroll still works on a tall day and across many courts.
- Phone: tap to place works, and a touch drag on an empty board still scrolls.
- Save succeeds, and reopening shows the same times.

### Step 3: Set up and Auto-schedule

**Done 2026-11-04.** Later steps can rely on: `ScheduleSheet` for any new sheet, with `sheet` state and
`openSheet`/`closeSheet` handling focus and Escape; `describeSetUp` for the one-line summary. The day's
on/off control is in Set up now, and the one in the day tab is still there for step 4 to remove. Set up is
under More on a phone, because the toolbar has no room for it until step 4 reworks it.

**Why here:** with placement reading match length, there is now one logical home for it.

**Files:** `components/ScheduleMakerModal.jsx`, `styles/schedule-maker.css`, `helpContent.js`,
`docs/schedule.md`, `docs/known-limitations.md`.

**Do:**

- Add a sheet inside the modal: a panel over the right of the board, full screen at 900px and below.
  One open at a time. Escape closes it before the modal. It stays inside the existing focus trap.
- **Set up** holds day hours, match length and lengths by round, courts with their division
  restriction on the same row, add and remove court, and days on or off.
- **Grid lines every** goes above the board, next to the day tabs, as a direct control.
- **Auto-schedule** holds only rules, using the existing `GeneratorOption`, with the groups in decision 11.
- Auto-schedule reads hours, courts and lengths from the schedule. `courtCount` becomes
  `schedule.courts.length`. With no courts, it directs the organiser to Set up.
- Writing a match length merges into `settings.generator` with `updateSettings`, starting from
  `DEFAULT_GENERATOR_SETTINGS` when null. Remove the generator's own copies of these fields from
  `generatorDraft`.
- Add Enter to submit in the add-court field. Word draft actions as unsaved, such as "Court 1 added".
- Update `docs/schedule.md`: `settings.generator` now also holds lengths set in Set up. Update Help.
  Strike the resolved items in `known-limitations.md:521`.
- Remove `SettingsPanel` and the settings, court and generate panel modes. Their contents have moved.

**Don't:**

- Change what any rule does, its default, or the generator's arguments beyond their source.
- Move any data out of `settings.generator`.
- Touch the entry editor or the print panel yet.

**Verify:**

- Each moved setting saves, reloads and applies.
- Generating with the same settings as before produces the same schedule. Compare one schedule
  before and after, including a court restricted to a division.
- A schedule saved before this work opens with its values showing.
- A never-generated schedule shows its fallback match length and can be saved.
- Changing match length moves nothing on the board and the next placement uses it.
- Changing a day's hours draws the board correctly, and out-of-hours entries still list beneath it.
- Escape closes the sheet first, then the modal. Tab stays inside the modal.
- All sheet controls are 44px on a phone.

### Step 4: Edit on the board

**Done 2026-11-04.** Every mutation now goes through `dispatch` in the modal, which is what step 5 wraps.
`popover` and `sheet` are the two kinds of open thing, with Escape closing the menu, then the popover, then
the sheet, then the modal.

**Why here:** the right column can go once nothing but the entry editor, breaks and print remain in it.

**Files:** `components/ScheduleMakerModal.jsx`, `components/SchedulePrintLayoutEditor.jsx` (only if the
wider container needs it), `styles/schedule-maker.css`, `styles/schedule-print.css`, `helpContent.js`,
`docs/known-limitations.md`, `DESIGN.md`.

**Do:**

- Clicking a match opens a popover at the block with start, length, court, day, officials, notes and
  Remove from schedule. Changes apply when a field commits. A refusal shows its reason in the popover
  and leaves the match unchanged. On a phone it is a bottom sheet.
- Length replaces the End Time field in the popover.
- Add a **Break** item at the top of the fixtures list. Drag or tap it onto the board. It covers all
  courts for 30 minutes unless changed. Its popover holds title, times, court scope and notes. Remove
  `BreakPanel`.
- Tapping an empty stretch with nothing selected still opens the fixture picker, now as a popover or
  sheet at that time.
- **Print** opens a full-size sheet holding the Grid and List choice, the page-break editor and Print.
  Keep the staged-changes note.
- Move the generation report to a dismissible strip above the board, keeping Show.
- Replace the overview with one progress line in the top bar. Stats beyond it go.
- Top bar: progress, then Set up, Auto-schedule, Print and Save. Discard Changes and Reset Schedule move
  into a More menu, and destructive items are styled as such.
- Fix the on/off control nested in the day tab: remove it, since Set up holds it. The tab still shows
  when a day is off.
- Phone tabs become Fixtures and Board.
- The board gains the width the right column held.
- Update Help throughout, remove the Inspector section, and record the new structure in `DESIGN.md`.

**Don't:**

- Change validation, the print renderer or the generator.
- Remove the keyboard route. Every popover field must be reachable, and opening a match with Enter must
  still work.

**Verify:**

- Each of these is reachable on desktop and on a phone: edit a match, remove it, add a break, restrict a
  court, auto-schedule, print, discard, reset, save.
- A match can be edited by keyboard alone.
- Two popovers can't be open at once, and Escape closes the innermost thing first.
- A popover near the board's edge stays on screen and is not clipped by the scroller.
- A resize while the popover is open shows the new times, and closing doesn't restore old ones.
- Page-break edits stage and save with the schedule as they do now.
- Read-only viewers (`canEdit` false) see the board and print, and no edit controls.
- No nested interactive elements remain in the day tabs.

### Step 5: Undo

**Why here:** a small addition that is safest once the mutation paths have settled.

**Files:** `components/ScheduleMakerModal.jsx`.

**Do:**

- Keep a stack of up to 50 schedule snapshots. Push before each dispatch that changes the schedule, through
  one wrapper. Add Undo to the top bar. Ctrl+Z works outside text fields.
- Undoing keeps the schedule marked as changed.
- Clear the stack on save and on discard.

**Don't:** persist it, or add redo.

**Verify:**

- Place, move, resize, edit, remove, break, court changes and Auto-schedule each undo in one step.
- Undo after Reset restores the board.
- Save clears it.
- Ctrl+Z inside a text field edits the field and doesn't undo the board.

## 7. Final validation

Run once, after the last step.

1. In `tourganiser-ui/`: `npm test`, `npm run lint`, `npm run build`. All pass.
2. In `api/`: `npm test` passes, confirming nothing there was affected.
3. Build a real schedule from scratch at 1280px with several divisions: Set up, Auto-schedule, adjust by
   hand with a 25-minute match, a long final and a lunch break, then save and reload.
4. Print it as a PDF from both the maker and `/print`, in grid and list. Compare it with the board time by
   time.
5. Repeat the placement and editing on a phone at 375px, in both themes.
6. Open a schedule saved before this work, ideally a copy of HST 2026 with its 50-minute grid. It must open,
   print and save without changing any entry.
7. Confirm `docs/schedule.md`, `docs/decisions.md`, `docs/known-limitations.md`, `helpContent.js` and
   `DESIGN.md` describe what shipped.
8. Move anything durable from this document into those files, and delete this document.
