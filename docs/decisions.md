# Architectural Decisions

## JSONB Division State

Reason:
Tournament structures are dynamic.

## Fixtures Separate From Division State

Reason:
Fixtures are reusable entities referenced by ID.

## Scheduling Separate From Fixture Generation

Reason:
Schedules should be regenerated independently of fixtures.

## Raw pg

Reason:
Maintain direct SQL control and avoid unnecessary abstraction.
