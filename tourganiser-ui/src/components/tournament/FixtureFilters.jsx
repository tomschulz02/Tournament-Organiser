import { useId } from 'react';
import { ALL } from './fixtureUtils';
import { divisionColorStyle } from '../../utils/divisionColors';

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
	const divisionLabelId = useId();

	return (
		<div className="tv-filters">
			{/* Chips rather than a select: divisions are few, and seeing them all
			    with their colour dots is faster than opening a list. One at a time,
			    like the select it replaces. */}
			{divisions.length > 1 && (
				<div className="tv-filter tv-filter--chips" role="group" aria-labelledby={divisionLabelId}>
					<span id={divisionLabelId}>Division</span>
					<div className="tv-division-chips">
						<button
							type="button"
							className="tv-division-chip"
							aria-pressed={value.divisionId === ALL}
							onClick={() => onChange({ ...value, divisionId: ALL })}>
							All
						</button>
						{divisions.map((division) => (
							<button
								key={division.id}
								type="button"
								className="tv-division-chip"
								style={divisionColorStyle(division.id, divisions)}
								aria-pressed={value.divisionId === division.id}
								onClick={() => onChange({ ...value, divisionId: division.id })}>
								<span className="tv-division-chip-dot" aria-hidden="true" />
								{division.name}
							</button>
						))}
					</div>
				</div>
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
