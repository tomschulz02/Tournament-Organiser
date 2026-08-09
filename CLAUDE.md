# Tourganiser - Claude Code Instructions

## Purpose
You are assisting with development of Tourganiser.

Primary goals:
- Make the smallest correct change.
- Preserve the existing architecture.
- Minimize token/credit usage.
- Reuse existing code whenever possible.
- Never make Medium or High Risk changes without approval.

## Behaviour
- Solve only the requested task.
- Do not refactor unrelated code.
- Minimize edited files.
- Search before creating new functions, components, services, hooks, utilities, interfaces or types.
- Prefer existing libraries over custom implementations.
- Never commit, push, merge, rebase or stage files unless instructed.
- Never change schemas, dependencies, routing, authentication or shared business logic without approval.
- After each task, suggest possible improvements but never implement them without approval.
- Never run git commands. See Git below.

## Git

Do not run any git command in this repository. This includes read-only ones such as
`git status`, `git diff`, `git log` and `git ls-files`.

Reason: the sandbox mount allows creating files under `.git/` but not deleting them.
Git takes `.git/index.lock` even for read-only commands that refresh the index, then
fails to release it. The stale lock blocks all further git operations until it is
deleted manually from Windows. This has already happened once.

When git information or a git action is needed:

1. State which command is needed and why.
2. Wait for the user to run it and paste the output.
3. Continue from that output.

Do not work around this with `--no-optional-locks`, by reading `.git/` directly, or by
shelling out through another tool. Ask.

To inspect the working tree, read the files themselves. That covers almost every case —
git is only genuinely required for history, staged state and remote operations.

If a stale lock appears anyway, the fix is `Remove-Item .git\index.lock -Force` from the
repository root in PowerShell. The file is empty and holds no state.

## Risk Levels
Low:
- UI text
- styling
- isolated bug fixes
- validation
- logging

Medium:
- business logic
- shared utilities
- reusable services
- scheduling
- fixture generation

High:
- schema
- architecture
- authentication
- dependencies
- large refactors
- deleting code

For Medium or High Risk:
1. Explain the change.
2. List affected files.
3. Explain risks.
4. Wait for approval.

## Project Summary

Frontend:
React + Vite + React Router

Backend:
Node.js + Express

Database:
PostgreSQL (Neon) using raw pg

Hosting:
Render

Domain:
GoDaddy (domain registration only)

Backend lives in:
api/

Frontend lives in:
tourganiser-ui/

Ignore:
StreamScoreboard/

## Commands

Backend (run from api/):
- npm install
- npm start (node --watch src/server.js)

Frontend (run from tourganiser-ui/):
- npm install
- npm run dev
- npm run build
- npm run lint

Tests (run from api/):
- npm test (vitest run --coverage — unit and integration suites, gated at 100% coverage)
- npm run test:watch
- npm run test:bugs (the known-bug suite; see below)

api/test/known-bugs/known-bugs.test.js is expected to fail. Each case encodes the
behaviour the code was written to have and names the line that prevents it, so the
suite is a specification for outstanding fixes rather than a regression guard. It is
excluded from the default run so that npm test stays a usable signal. When a bug is
fixed, move its test into the matching unit or integration file.

No test suite exists for tourganiser-ui/.
No lint setup exists for api/.

## Source of Truth

docs/database.md is correct where the code disagrees with it.
docs/division-state.md is correct for the shape of divisions.state.
docs/api.md defines the target response contract; parts of the code do not yet match it.

Known drift is recorded in docs/known-limitations.md. Do not fix drift as a batch —
fix each case only when working on the feature that touches it.

Additional documentation:

- docs/architecture.md
- docs/database.md
- docs/division-state.md
- docs/tournament-rules.md
- docs/api.md
- docs/project-philosophy.md
- docs/decisions.md
- docs/future-features.md
- docs/known-limitations.md
- docs/gap-analysis.md
- docs/roadmap.md
- docs/git-hygiene.md

Consult these only when relevant to the task.

## Handover Documents

Non-trivial work is specified in a handover document under docs/, named
`handover-<subject>.md`, and deleted once the work is done. The durable record stays in
the standing documents; a handover is scaffolding.

Use this structure. It was arrived at through
`docs/handover-tournament-view-redesign.md` and is the required format for all future
handovers.

1. **Risk declaration.** State the Risk Level from this file, the specific risks, and
   that the document itself is the explanation the Medium/High Risk process requires.

2. **How to use this document.** One step per session. Do not re-inspect anything the
   facts section already states. Do not run the final validation after every step. Read
   only the files a step names.

3. **Established facts.** The section that earns the format its keep. Record what the
   implementer would otherwise have to discover: payload shapes, available components,
   design tokens, real breakpoints, what exists and what does not. An instruction to
   "inspect the codebase thoroughly" is the single largest avoidable cost in a handover
   — replace it with the answers. Include a table of anything the specification asks for
   that the data cannot support.

4. **Decisions already made.** Settled questions, marked not to be revisited.

5. **Non-goals.** What not to touch, explicitly.

6. **Numbered steps**, each independently shippable and each ending with the application
   working. Every step carries: why it is here, the files it touches, **Do**, **Don't**,
   and **Verify**. Write Do as intent plus constraints rather than literal code, so the
   document is followable by hand as well as by an agent. Verify is the contract.

7. **Final validation**, run once at the end.

Write for both readers. A developer following it manually and an agent implementing it
should need the same information.
