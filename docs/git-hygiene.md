# Git Hygiene

All git commands in this repository are run by the developer, never by Claude. See
"Claude and git" at the bottom for why.

One-off cleanup steps below. Run these yourself.

## Why

Before `.gitattributes` existed, `git diff --stat` reported roughly 185 changed files
across the whole repository, almost all of it CRLF versus LF churn from editing on
Windows. Real changes were impossible to pick out of that noise.

`.gitattributes` now sets `* text=auto` with explicit `eol=lf` for source files, so the
repository stores LF and Windows checkouts get native endings. Binaries are marked so
git never rewrites them, and `package-lock.json` is marked generated so it collapses in
diffs.

## Renormalise existing files

Adding `.gitattributes` only affects future writes. Existing files keep whatever endings
are already committed, so do this once:

    git add --renormalize .
    git status
    git commit -m "Normalise line endings"

Keep that commit on its own. Mixing it with real changes defeats the point.

## Track the documentation

`docs/` and `CLAUDE.md` are untracked. They are the source of truth for the schema and
the API contract, so losing them would be worse than losing code:

    git add CLAUDE.md docs/ .gitattributes
    git commit -m "Track project documentation"

## Check before committing

The working tree currently shows a large `Website/` deletion alongside everything else.
That predates this cleanup and looks like leftover state from the frontend migration.
Confirm it is intentional before it goes into a commit:

    git status --short | grep '^ D Website/'

## Verify secrets are not tracked

`api/.env` and `tourganiser-ui/.env` are both gitignored and neither is tracked. Confirm
after any `git add -A`:

    git ls-files | grep -i env

That should return nothing. If it ever returns a `.env` file, remove it from the index
with `git rm --cached` and rotate the credentials it contained — a value that reached a
commit should be treated as leaked.

## Claude and git

Claude must not run git commands in this repository — not even read-only ones like
`git status`, `git diff` or `git log`. The rule is recorded in `CLAUDE.md`.

The sandbox Claude works in mounts the repository such that files can be created under
`.git/` but not deleted. Git takes `.git/index.lock` even for read-only commands that
refresh the index, and then cannot release it. The stale lock blocks every subsequent
git operation, including your commits, until it is removed by hand.

This has happened once already, on 2026-08-07, from a `git status` call.

Instead, Claude states which command it needs and why, and you run it and paste back the
output. In practice this is rare: reading the working tree directly answers almost every
question, and git is only truly needed for history, staged state and remote operations.

## Clearing a stale lock

If git reports that `index.lock` exists and another process seems to be running, and you
know nothing else is using the repository:

    Remove-Item .git\index.lock -Force

The file is empty and holds no state, so nothing is lost. Two leftovers from the
2026-08-07 incident can be removed the same way:

    Remove-Item .git\index.lock, .git\test_write -Force
