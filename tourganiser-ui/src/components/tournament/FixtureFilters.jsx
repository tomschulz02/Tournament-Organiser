import { ALL } from './fixtureUtils';

// The filter bar for both states of the Fixtures & Schedule tab.
//
// Every filter is conditional. A control that offers one choice is not a filter,
// it is furniture — so the division filter is absent for a single-division
// tournament, and stage and status are absent when every fixture shares a value.
//
// Date and court are passed only in the scheduled state. They are meaningless
// without a schedule, and an empty date filter would imply missing data rather
// than absent scheduling.
export default function FixtureFilters({ value, onChange, divisions = [], rounds = [], statuses = [], days = null, courts = null }) {
	const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });

	return (
		<div className="tv-filters">
			{divisions.length > 1 && (
				<Field label="Division">
					<select value={value.divisionId} onChange={set('divisionId')}>
						<option value={ALL}>All divisions</option>
						{divisions.map((division) => (
							<option key={division.id} value={division.id}>
								{division.name}
							</option>
						))}
					</select>
				</Field>
			)}

			{days && days.length > 1 && (
				<Field label="Date">
					<select value={value.day} onChange={set('day')}>
						<option value={ALL}>All days</option>
						{days.map((day) => (
							<option key={day.date} value={day.date}>
								{day.label}
							</option>
						))}
					</select>
				</Field>
			)}

			{courts && courts.length > 1 && (
				<Field label="Court">
					<select value={value.courtId} onChange={set('courtId')}>
						<option value={ALL}>All courts</option>
						{courts.map((court) => (
							<option key={court.id} value={court.id}>
								{court.name}
							</option>
						))}
					</select>
				</Field>
			)}

			{rounds.length > 1 && (
				<Field label="Stage">
					<select value={value.round} onChange={set('round')}>
						<option value={ALL}>All stages</option>
						{rounds.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</Field>
			)}

			{statuses.length > 1 && (
				<Field label="Status">
					<select value={value.status} onChange={set('status')}>
						<option value={ALL}>Any status</option>
						{statuses.map((entry) => (
							<option key={entry.value} value={entry.value}>
								{entry.label}
							</option>
						))}
					</select>
				</Field>
			)}

			<Field label="Team">
				<input type="search" value={value.team} placeholder="Search teams" onChange={set('team')} />
			</Field>
		</div>
	);
}

function Field({ label, children }) {
	return (
		<label className="tv-filter">
			<span>{label}</span>
			{children}
		</label>
	);
}
