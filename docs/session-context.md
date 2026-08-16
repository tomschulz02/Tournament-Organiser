# Session Context

**This is not a project document.** It describes how the design and planning sessions for
Tourganiser are run, so that a session on a different device can pick up where the last
one left off and work the same way.

It is deliberately **not** listed in `CLAUDE.md`'s document index, and should not be read
during implementation. It is for the assistant Tom designs with, not the one that writes
the code.

Everything about the project itself lives in the standing documents. This file only
records what those cannot: the working agreement, the posture that has proved useful, and
the state of play.

---

## 1. The working agreement

**These sessions are for discussion and design. No implementation.** Tom sets this
explicitly at the start of a session and it holds unless he says otherwise.

Two standing exceptions:

- **Documentation updates are allowed and expected.** Decisions get recorded in the
  standing docs as they are made, not afterwards.
- **Changes too small to justify a handover** may be made directly when Tom approves them
  — a test config change, a one-line comment fix. Ask rather than assume.

**Work reaches the codebase through handover documents**, written here and implemented by
Claude Code in a separate session. They live at `docs/handover-<subject>.md` and are
deleted when the work is done. The required format is recorded in `CLAUDE.md` under
"Handover Documents", and it is not optional — Tom asked for it specifically after the
tournament view redesign, because that document's structure worked.

**Sometimes Tom implements a small fix himself.** When something is genuinely small he
will say so and ask for manual instructions instead: the same content, written for a
person with exact search strings, no risk framing, and a short verification list. The
fixture status vocabulary fix and the schedule grid placement fix both went that way.

**Tom asks for verification after Claude Code finishes.** The pattern is: read the
implementation against what the handover asked for, report anything wrong or missing,
promote anything durable into the standing docs, check for dangling references, then
delete the handover. Do not delete until all of that is done.

Dangling references have bitten twice — `CLAUDE.md` once pointed at a handover as a format
exemplar, and `tourganiser-ui/vitest.config.js` once explained itself by pointing at a
handover step. Both would have broken on deletion. Grep for the filename before removing
it.

---

## 2. How to be useful here

This is the part that does not survive in the standing docs, and it is most of what makes
these sessions work.

### Verify before asserting

Read the code. Do not reason from the documentation alone, and do not infer from a
plausible pattern. Three times this session an assertion made from a reasonable inference
turned out wrong:

- Selector renames were recommended in `styles/TournamentView.css` twice before anyone
  checked that **nothing imported it**. Both changes were no-ops.
- A tournament's missing pool fixtures were attributed to stale test data. They were
  known bug 2 — League divisions generated no fixtures at all.
- The schedule entry shape was stated as `{ court, start }` when it is
  `{ courtId, startTime, endTime }`.

All three have the same cause. Check, then say.

### Diagnose, do not file

When Tom reports a bug, find the cause before writing anything down. Several reports this
session had causes quite different from the symptom:

| Reported | Actual cause |
|---|---|
| "Creating a tournament does nothing" | It navigated to `/tournaments` — the route that renders the page the form was already on. |
| "The schedule maker always says the entry is outside the tournament dates" | `pg` returned `date` as a local-midnight `Date`; two helpers converted it back to a string, one in UTC and one in local time. |
| "Fixtures appear stacked in the schedule grid" | The background cells were auto-placed while entries were explicitly placed, so entries displaced the whole axis. |
| "Round robin fixture generation isn't working" | `createLeagueState` nested the team array one level too deep. |

A correct diagnosis routinely turns a rewrite into a few lines. It is worth the time.

### Say what he did not ask about, when it matters

The two clipped modals, the `totalGames` double-count hiding behind known bug 2, the
`teams` payload carrying objects rather than strings — none were asked about, and each
would have cost an afternoon. Flag them where they belong and move on; do not lecture.

### Push back once, with reasons, then respect the decision

The illustrative schematic in the creation review overrode the specification's own
instruction. Saying so plainly was right; relitigating it would not have been. Record the
decision and its consequences honestly, including what was given up.

### Own mistakes plainly

State what was wrong, why, and what changes as a result. No self-flagellation and no
burying it.

### Reconcile a specification against the codebase before writing a handover from it

Both redesign specs asked for things the data could not support — standings points, team
logos, player counts, officials, a real generated bracket before anything is persisted.
Name those explicitly in the handover, in a table, so nobody builds a placeholder for
something that does not exist. Ask clarifying questions first; the answers usually change
the shape of the work.

---

## 3. Trap classes that keep recurring

These have each cost real time. They are worth checking for by reflex.

**Silent failures.** The dominant failure mode in this codebase is something that renders,
runs, and is wrong. A `<header>` inside a card is stretched across the viewport by a bare
element selector. A container with `overflow-x: hidden` turns overflow into clipped
content rather than a scrolling page. `Math.max(1, findIndex(...) + 1)` turns "not found"
into row 1. Assume the loud failures have been found already.

**Dates and timezones.** `date` columns, `toISOString` versus `getFullYear`, and a test
suite pinned to `TZ=UTC` that cannot catch any of it.

**Stacking order.** Fourteen z-index values across fifteen orders of magnitude, and a
modal backdrop below the site header.

**CSS grid placement.** Auto-placed and explicitly-placed children in one grid displace
each other.

**Dead code that looks alive.** A selector is dead when **any** class in it is dead, not
when all of them are. A stylesheet that nothing imports still looks authoritative.
`Browse.jsx` builds class names dynamically, so a substring search will call live classes
unused.

**Documentation asserting things the code does not do.** `CLAUDE.md` denied a test suite
that existed; a CI comment claimed a coverage gate the config did not set; `architecture.md`
described controllers as empty after they were written. Check the claim, not just the
document.

**Tests that encode the behaviour being replaced.** The generator's suite contained both
invariants and heuristic assertions. Making a rewrite pass all of them would have
preserved the fault it was meant to fix.

---

## 4. Where the real knowledge lives

Do not restate these; read them and point at them.

| Document | Holds |
|---|---|
| `CLAUDE.md` | Instructions for the implementer, risk levels, the git prohibition, the handover format |
| `docs/architecture.md` | Layering, current build state, frontend structure, and the frontend traps |
| `docs/decisions.md` | Every architectural decision with its reasoning, including superseded ones |
| `docs/roadmap.md` | Phase-by-phase state. **The authority on what is done and what is next.** |
| `docs/known-limitations.md` | What is currently wrong, missing or deferred |
| `docs/api.md` | HTTP contract, envelope, error handling, path convention, endpoint reference |
| `docs/database.md` | Schema. Source of truth where the code disagrees. |
| `docs/division-state.md` | Shape of `divisions.state` |
| `docs/schedule.md` | Shape of `tournaments.schedule` |
| `docs/tournament-rules.md` | Domain rules — ranking, progression, fixture status |
| `docs/future-features.md` | Discussed, documented, not to be built |
| `docs/gap-analysis.md` | A dated survey from the start of the work. Allowed to be stale. |
| `docs/project-philosophy.md` | Simple over clever, incremental, no unnecessary abstraction |

The two most load-bearing conventions, both in `decisions.md`: **the server has authority
over tournament state**, and **ownership is checked in the service, not in middleware**.
Almost every design question resolves against one of them.

---

## 5. State of play

`docs/roadmap.md` is the authority. In brief, as of 2026-08-16:

**Done.** Phases 0 to 5 — ground truth, the critical path, the contracts, making a
tournament runnable, teams, scheduling, and correctness and consolidation. Both redesigns:
the tournament view and tournament creation. An organiser can create a tournament, start
it, enter scores, advance rounds, build and save a schedule, and finish it.

The mobile refresh landed on 2026-08-16 — spacing and stacking scales, the mobile spacing
pass, and the schedule maker's panel switcher and grid scroller — followed by two
follow-up fixes to the schedule maker on small screens. Both handovers are deleted; the
record is in `docs/roadmap.md` under "Mobile, application-wide".

**In flight.** `docs/handover-schedule-maker-chrome.md` — reclaiming the 400–470px the
schedule maker's chrome takes on a phone, making two unscrollable panels scroll, and
letting a schedule be built without generating one first. Eight steps, not started.

**Decided, not built.** The standings changes: points for and against into the default
table, and set-score outcome columns derived per division. Client-side caching that
survives a refresh. The knockout bracket's node spacing.

**Deliberately deferred.** Everything in `future-features.md`, including the Profile page
that Saved Tournaments depends on. Friends was removed outright on 2026-08-11 — it was a
step towards editors and scorers, and a per-tournament permission is a better shape.

**One thing that has never been green.** `npm run test:bugs` still reports bug 10, five
cases covering unreachable saved-tournament functions. It empties when the Profile page is
built.

---

## 6. Things Tom has been clear about

- **Never run git.** `CLAUDE.md` explains why — the sandbox can create but not delete
  files under `.git/`, and a stale `index.lock` blocks his commits. Ask him to run
  commands and paste the output.
- **The handover format is required**, and its most valuable section is Established Facts,
  which replaces "inspect the codebase thoroughly". That instruction is the single largest
  avoidable cost in a handover.
- **Documentation gets updated as decisions are made**, not in a batch at the end.
- **Drift is fixed when the surrounding code is touched**, never as a sweep.
- He reads carefully and will correct an inaccuracy. Being wrong is fine; being vague
  about it is not.
