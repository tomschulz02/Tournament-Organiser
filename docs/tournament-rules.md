# Tournament Rules

## Terminology

Tournament
Collection of one or more divisions.

Division
Independent competition.

Fixture
Single match.

Round
Collection of fixtures.

Schedule
Assigns fixtures to courts, dates, times and optionally officials.

## Rules

Fixture generation determines only participating teams.

Scheduling determines:
- court
- date
- time
- officials (optional)

Scheduling must remain independent from fixture generation.

Knockout stages are independent from pool stages.

Placeholder knockout fixtures may be generated for user reference.

Teams are stored in their own table.

Division state references Team IDs.

Fixtures are stored separately and referenced by ID.
