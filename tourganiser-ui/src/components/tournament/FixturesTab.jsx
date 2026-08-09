import { useMemo, useState } from 'react';
import SectionState from './SectionState';
import FixtureRow from './FixtureRow';
import FixtureFilters from './FixtureFilters';
import {
	EMPTY_FILTERS,
	distinct,
	distinctStatuses,
	flattenFixtures,
	matchesFixtureFilters,
} from './fixtureUtils';

// Fixtures & Schedule in its unscheduled state: every division's fixtures in one
// list, ordered by match number across the whole tournament.
//
// There is no time, court or official column here. Those do not exist until a
// schedule does, and an empty column reads as missing data rather than as
// scheduling that has not happened yet. ScheduleTab replaces this presentation
// wholesale when tournament.schedule is non-null — it is not a view the user can
// toggle.
export default function FixturesTab({ divisions = [], creator = false, onCreateSchedule, renderFixtureAction }) {
	const fixtures = useMemo(() => flattenFixtures(divisions), [divisions]);
	const [filters, setFilters] = useState(EMPTY_FILTERS);

	// Derived from the fixtures actually present, so the filters never offer a
	// round or a status that would match nothing.
	const rounds = useMemo(() => distinct(fixtures.map((fixture) => fixture.round)), [fixtures]);
	const statuses = useMemo(() => distinctStatuses(fixtures), [fixtures]);

	const visible = useMemo(
		() => fixtures.filter((fixture) => matchesFixtureFilters(fixture, filters)),
		[fixtures, filters],
	);

	const filtered = visible.length !== fixtures.length;

	return (
		<div className="tv-fixtures">
			<div className="tv-fixtures-toolbar">
				<FixtureFilters
					value={filters}
					onChange={setFilters}
					divisions={divisions}
					rounds={rounds}
					statuses={statuses}
				/>

				{/* Organiser only. A viewer sees nothing extra at all. */}
				{creator && onCreateSchedule && (
					<button type="button" className="tv-primary-action" onClick={onCreateSchedule}>
						Create Schedule
					</button>
				)}
			</div>

			<p className="tv-fixtures-count">
				{filtered ? `${visible.length} of ${fixtures.length} fixtures` : `${fixtures.length} fixtures`}
			</p>

			{fixtures.length === 0 && (
				<SectionState
					variant="empty"
					title="This tournament has no fixtures yet"
					message="Fixtures are generated when the tournament is created."
				/>
			)}

			{fixtures.length > 0 && visible.length === 0 && (
				<SectionState
					variant="empty"
					title="No fixtures match these filters"
					message="Widen or clear a filter to see more.">
					<button type="button" className="tv-retry" onClick={() => setFilters(EMPTY_FILTERS)}>
						Clear filters
					</button>
				</SectionState>
			)}

			{visible.length > 0 && (
				<ul className="tv-fixture-rows">
					{visible.map((fixture) => (
						<FixtureRow
							key={fixture.id}
							fixture={fixture}
							showDivision={divisions.length > 1}
							action={creator && renderFixtureAction ? renderFixtureAction(fixture) : null}
						/>
					))}
				</ul>
			)}
		</div>
	);
}
