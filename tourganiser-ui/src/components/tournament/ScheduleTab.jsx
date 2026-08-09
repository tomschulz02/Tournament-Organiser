import { useMemo, useState } from 'react';
import SectionState from './SectionState';
import FixtureRow from './FixtureRow';
import FixtureFilters from './FixtureFilters';
import {
	EMPTY_FILTERS,
	distinct,
	distinctStatuses,
	flattenFixtures,
	hasFixtureFilter,
	indexById,
	matchesFixtureFilters,
} from './fixtureUtils';
import {
	calculateScheduledStats,
	compareTimes,
	formatDateLabel,
	getCourtName,
	getScheduleForTournament,
} from '../../utils/scheduleUtils';

// Fixtures & Schedule in its scheduled state, reached when tournament.schedule
// is non-null. Same tab, same route, and no way for the reader to choose — the
// state is a fact about the tournament, not a preference.
//
// The hierarchy answers what, when and where in that order: a day, then a time,
// then the courts running at that time. Grouping by time rather than by court is
// what makes "what is on now" readable, which is the question actually being
// asked at a tournament.
export default function ScheduleTab({ tournament = {}, divisions = [], creator = false, onEditSchedule, renderFixtureAction }) {
	const schedule = useMemo(() => getScheduleForTournament(tournament), [tournament]);
	const fixtures = useMemo(() => flattenFixtures(divisions), [divisions]);
	const fixtureIndex = useMemo(() => indexById(fixtures), [fixtures]);

	const [filters, setFilters] = useState(EMPTY_FILTERS);

	const rounds = useMemo(() => distinct(fixtures.map((fixture) => fixture.round)), [fixtures]);
	const statuses = useMemo(() => distinctStatuses(fixtures), [fixtures]);
	const stats = useMemo(() => calculateScheduledStats(schedule, fixtures), [schedule, fixtures]);

	// Only the days that carry entries. A tournament's date range is generated
	// from its start and end dates, so it routinely contains days nobody has
	// scheduled anything on.
	const days = useMemo(
		() => schedule.days.filter((day) => schedule.entries.some((entry) => entry.day === day.date)),
		[schedule],
	);

	const sections = useMemo(
		() => buildSections({ schedule, days, filters, fixtureIndex }),
		[schedule, days, filters, fixtureIndex],
	);

	// Distinct fixtures that have a slot. calculateScheduledStats counts fixture
	// *entries* instead, which is the same number only while no fixture is placed
	// twice — and nothing enforces that yet: the server-side validation that
	// rejects a fixture appearing twice is specified in docs/decisions.md but
	// unwritten. Counting the set keeps "x of y scheduled" and the unscheduled
	// list below consistent with each other whatever the data does.
	const placed = useMemo(
		() =>
			new Set(
				schedule.entries
					.filter((entry) => entry.type === 'fixture' && entry.fixtureId)
					.map((entry) => entry.fixtureId),
			),
		[schedule],
	);

	// Partial schedules are legal — see docs/decisions.md — so anything not placed
	// has to stay visible, or fixtures would silently disappear from the tab the
	// moment a schedule existed.
	const unscheduled = useMemo(
		() => fixtures.filter((fixture) => !placed.has(fixture.id) && matchesFixtureFilters(fixture, filters)),
		[placed, fixtures, filters],
	);

	const scheduledShown = sections.reduce((total, day) => total + day.groups.reduce((n, g) => n + g.entries.length, 0), 0);
	const showDivision = divisions.length > 1;

	return (
		<div className="tv-fixtures">
			<div className="tv-fixtures-toolbar">
				<FixtureFilters
					value={filters}
					onChange={setFilters}
					divisions={divisions}
					rounds={rounds}
					statuses={statuses}
					days={schedule.days}
					courts={schedule.courts}
				/>

				{/* In place of Create Schedule, not alongside it. */}
				{creator && onEditSchedule && (
					<button type="button" className="tv-primary-action" onClick={onEditSchedule}>
						Edit Schedule
					</button>
				)}
			</div>

			<p className="tv-fixtures-count">
				{placed.size} of {stats.totalFixtures} fixtures scheduled
				{stats.courts > 0 && ` · ${stats.courts} court${stats.courts === 1 ? '' : 's'}`}
				{stats.days > 0 && ` · ${days.length} of ${stats.days} day${stats.days === 1 ? '' : 's'} in use`}
			</p>

			{scheduledShown === 0 && unscheduled.length === 0 && (
				<SectionState
					variant="empty"
					title="Nothing matches these filters"
					message="Widen or clear a filter to see more of the schedule.">
					<button type="button" className="tv-retry" onClick={() => setFilters(EMPTY_FILTERS)}>
						Clear filters
					</button>
				</SectionState>
			)}

			{sections.map((day) => (
				<section key={day.date} className="tv-schedule-day">
					<h2 className="tv-schedule-day-heading">
						<span>{day.label}</span>
						<span className="tv-schedule-day-date">{formatDateLabel(day.date)}</span>
					</h2>

					{day.groups.map((group) => (
						<div key={group.startTime} className="tv-time-group">
							<div className="tv-time-group-time">
								<span>{group.startTime}</span>
							</div>

							<ul className="tv-fixture-rows tv-time-group-entries">
								{group.entries.map((entry) =>
									entry.type === 'break' ? (
										<BreakRow key={entry.id} entry={entry} schedule={schedule} />
									) : (
										<FixtureRow
											key={entry.id}
											fixture={entry.fixture}
											showDivision={showDivision}
											court={getCourtName(schedule, entry.courtId)}
											action={creator && renderFixtureAction ? renderFixtureAction(entry.fixture) : null}
										/>
									),
								)}
							</ul>
						</div>
					))}
				</section>
			))}

			{unscheduled.length > 0 && (
				<section className="tv-schedule-day">
					<h2 className="tv-schedule-day-heading">
						<span>Not yet scheduled</span>
						<span className="tv-schedule-day-date">{unscheduled.length} fixtures</span>
					</h2>

					<ul className="tv-fixture-rows">
						{unscheduled.map((fixture) => (
							<FixtureRow
								key={fixture.id}
								fixture={fixture}
								showDivision={showDivision}
								action={creator && renderFixtureAction ? renderFixtureAction(fixture) : null}
							/>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}

// A break belongs to the timetable rather than to any fixture, so it gets a row
// of its own rather than being dropped. A gap with no explanation reads as a
// scheduling mistake.
function BreakRow({ entry, schedule }) {
	return (
		<li className="tv-fixture-row tv-fixture-row--break">
			<span className="tv-match-no">—</span>
			<span className="tv-fixture-row-teams">
				<span>{entry.title || 'Break'}</span>
			</span>
			<span className="tv-fixture-row-meta">
				{entry.courtId && <span className="tv-court-chip">{getCourtName(schedule, entry.courtId)}</span>}
			</span>
			<span className="tv-fixture-row-outcome tv-fixture-row-outcome--status">
				{entry.startTime}–{entry.endTime}
			</span>
		</li>
	);
}

// Day -> start time -> the courts running at that time.
function buildSections({ schedule, days, filters, fixtureIndex }) {
	const hideBreaks = hasFixtureFilter(filters);

	return days
		.filter((day) => !filters.day || day.date === filters.day)
		.map((day) => {
			const entries = schedule.entries
				.filter((entry) => entry.day === day.date)
				.filter((entry) => !filters.courtId || entry.courtId === filters.courtId)
				.map((entry) => ({ ...entry, fixture: entry.fixtureId ? fixtureIndex.get(entry.fixtureId) : null }))
				.filter((entry) => {
					if (entry.type === 'break') return !hideBreaks;
					// An entry pointing at a fixture that no longer exists is dropped
					// rather than rendered as an empty row.
					if (!entry.fixture) return false;

					return matchesFixtureFilters(entry.fixture, filters);
				})
				// Time first, then court, so a group reads left to right across the
				// courts in a stable order.
				.sort(
					(a, b) =>
						compareTimes(a.startTime, b.startTime) || String(a.courtId || '').localeCompare(String(b.courtId || '')),
				);

			return { date: day.date, label: day.label, groups: groupByStartTime(entries) };
		})
		.filter((day) => day.groups.length > 0);
}

function groupByStartTime(entries) {
	const groups = [];

	entries.forEach((entry) => {
		const current = groups[groups.length - 1];

		if (current && current.startTime === entry.startTime) {
			current.entries.push(entry);
			return;
		}

		groups.push({ startTime: entry.startTime, entries: [entry] });
	});

	return groups;
}
