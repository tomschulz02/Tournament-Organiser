# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two primary users, each owning its own surfaces. When their needs conflict, the surface decides.

- **Organisers** (tournament directors, club and university volleyball organisers, e.g. TuksVolleyball). They create tournaments, enter teams and seeding, build the schedule, start the event, enter scores, advance rounds and end it. Work happens both ahead of the event (often on a laptop) and courtside on the day (often on a phone). Organisers can add **editors** who may enter results.
- **Spectators** (players, parents, coaches). Most people who open a tournament are on a phone at the venue, looking for their team's next match, its court and time, and the latest results and standings. They have no account and need none.

Surfaces split accordingly: setup, schedule maker, score entry and settings are organiser surfaces; the public tournament view (overview, fixtures and schedule, standings, knockout, final rankings, teams) is the spectator surface. Discover/Home serve both.

## Product Purpose

Tourganiser creates and runs sports tournaments, volleyball first. It builds a suitable format from the number of teams entered, generates fixtures, schedules them onto courts and times, and tracks results and standings through pool and knockout stages. It exists to replace spreadsheets and scheduling headaches so organisers can focus on the event.

Success: an organiser can set up and run an event end to end without a spreadsheet, and a spectator at the venue can find what they need on their phone without asking anyone.

## Positioning

- Free for everyone: no subscriptions, no paywalls, no ads. Funded only by voluntary donations.
- Volleyball-first, indoor and beach, with domain rules taken seriously (sets decide matches, per-round match format, seeding as final tiebreaker, FIVB scoresheets).
- The format is derived from the team count rather than configured from scratch.
- More sports are a stated future direction; volleyball is the current focus.

## Operating Context

- Events range from small local one-day events to multi-day competitions with several divisions.
- On the day, the app is used at the venue: courtside, in halls and on beaches, on phones, over venue wifi that is often poor.
- Organisers print schedules (dedicated print route) and use printed FIVB scoresheets (indoor 2013 and beach 2024 templates, filled in the client).
- An Ongoing tournament refreshes for spectators every 20 seconds while visible; there is no point-by-point live scoring.
- Production holds real tournaments (e.g. TuksVolleyball HST 2026).

## Capabilities and Constraints

**Terminology** (source of truth: `docs/tournament-rules.md`): Tournament (one or more divisions), Division (an independent competition), Round, Fixture (a single match), Schedule (court, date, time, optional free-text officials), Seeding. Fixture statuses are exactly `UPCOMING`, `LIVE`, `COMPLETED`, `CANCELLED`.

**Built:** account sign-up and sign-in; tournament creation with divisions (Classic: pools then knockout; League: round robin; Single Elimination offered but disabled); team entry and seeding (reorderable only before start); fixture generation; schedule maker and generator; per-set score entry; standings; knockout bracket; placement matches; final rankings; editors; schedule print; scoresheet templates; light and dark themes; in-app help.

**Not built** (do not design as if present, do not advertise): analytics, statistics or reports beyond standings and final rankings; team pages / follow a team; live point-by-point scoring; editing tournament details after creation; draft/unlisted visibility; password reset and account management; forfeit handling.

**Constraints:**
- Must stay understandable and maintainable by a single developer; prefer simple, incremental solutions (`docs/project-philosophy.md`).
- React + Vite single-page app; Node/Express API; hosted on Render. No server-rendered pages today.
- The server has authority over tournament state; the client never asserts a status.
- Planned direction is recorded in `docs/future-features.md` and `docs/roadmap.md`.

## Brand Commitments

- Name: **Tourganiser**. Logo and icon assets in `tourganiser-ui/public/` (`logo.svg`, PNG sizes, `assets/icon.svg`).
- South African product (`tourganiser.co.za`); copy uses British/South African spelling ("organiser", "customise").
- Voice in existing copy: plain, friendly, practical; "no more spreadsheets, no more stress".
- Support channels: support@tourganiser.co.za, a Discord server, and Buy Me a Coffee (`buymeacoffee.com/tourganiser`).

## Evidence on Hand

- Feature screenshots: `tourganiser-ui/public/assets/` (`creation`, `fixtures`, `teams`, `format`, `results`, `standings`, `live-updates` `.webp`), plus venue backgrounds (`bg-indoor`, `bg-beach`) and sport ball images.
- Official FIVB scoresheet templates: `tourganiser-ui/public/scoresheet-templates/`.
- Real tournaments exist in production, but no testimonials, user counts, press or case studies are on hand. Do not invent any.
- The Home page's "Analytics" feature card describes a feature that does not exist; future copy must not claim it.

## Product Principles

1. **Each surface serves its own user.** Organiser screens optimise for getting the event run correctly; spectator screens optimise for finding a team's next match and latest result fast, on a phone.
2. **Built for the venue, not the desk.** Assume a phone, a busy hall or beach, and poor connectivity on the day.
3. **Correct results over clever features.** Tournament outcomes are public and consequential; the rules in `docs/tournament-rules.md` win.
4. **Free and unobtrusive.** No ads, no upsells, no friction for people who just want to look.
5. **Claim only what exists.** Product copy describes built features only.
