import CreateModal from './CreateModal';
import FormatSchematic from './FormatSchematic';
import Icon from '../Icons';
import { getFormatLabel, isConfigurableFormat } from './divisionFormats';

// yyyy-mm-dd from a date input, read as a plain calendar date. Parsed through
// Date.UTC rather than new Date(value), which shifts the day backwards for
// anyone west of Greenwich.
function formatDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '';

	const [year, month, day] = value.split('-').map(Number);

	return new Intl.DateTimeFormat('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

// The last look before anything is created.
//
// Deliberately not a read-only copy of the form: the details are presented as
// the tournament rather than as the fields that were filled in, and each
// division is summarised the way it will actually be played. The form stays
// mounted behind this — closing returns to it untouched.
export default function ReviewModal({ details, divisions, isCreating, onClose, onCreate }) {
	const totalTeams = divisions.reduce((sum, division) => sum + division.teams.length, 0);

	const footer = (
		<>
			<div className="ct-modal-footer-left" />
			<div className="ct-modal-footer-right">
				<button type="button" className="ct-button ct-button-quiet" onClick={onClose} disabled={isCreating}>
					Close
				</button>
				<button type="button" className="ct-button ct-button-primary" onClick={onCreate} disabled={isCreating}>
					{isCreating ? 'Creating…' : 'Create Tournament'}
				</button>
			</div>
		</>
	);

	return (
		<CreateModal
			titleId="ct-review-modal-title"
			title="Review your tournament"
			subtitle="Nothing has been created yet. Check it over, then confirm."
			size="large"
			onClose={onClose}
			footer={footer}>
			<div className="ct-review">
				<div className="ct-review-headline">
					<h3 className="ct-review-name">{details.name}</h3>
					<div className="ct-review-meta">
						<span className="ct-review-meta-item">
							<Icon name="location" size={18} />
							<span>{details.location}</span>
						</span>
						<span className="ct-review-meta-item">
							<Icon name="calendar" size={18} />
							<span>
								{formatDate(details.start_date)}
								{details.end_date !== details.start_date && ` — ${formatDate(details.end_date)}`}
							</span>
						</span>
						<span className="ct-review-meta-item">
							<Icon name="structure" size={18} />
							<span>
								{divisions.length} {divisions.length === 1 ? 'division' : 'divisions'}, {totalTeams} teams
							</span>
						</span>
					</div>
					{details.description.trim().length > 0 && (
						<p className="ct-review-description">{details.description}</p>
					)}
				</div>

				<div className="ct-review-divisions">
					{divisions.map((division) => (
						<ReviewDivision key={division.id} division={division} />
					))}
				</div>
			</div>
		</CreateModal>
	);
}

function ReviewDivision({ division }) {
	const configurable = isConfigurableFormat(division.type);

	return (
		<section className="ct-review-division">
			<div className="ct-review-division-head">
				<h4 className="ct-review-division-name">{division.name}</h4>
				<span className="ct-review-division-format">{getFormatLabel(division.type)}</span>
			</div>

			<dl className="ct-review-facts">
				<div className="ct-review-fact">
					<dt>Teams</dt>
					<dd>{division.teams.length}</dd>
				</div>
				{configurable && (
					<>
						<div className="ct-review-fact">
							<dt>Pools</dt>
							<dd>{division.num_groups}</dd>
						</div>
						<div className="ct-review-fact">
							<dt>Advancing</dt>
							<dd>{division.knockout_teams}</dd>
						</div>
					</>
				)}
			</dl>

			{/* Every team appears here, inside the pool it will be drawn into.
			    A flat list beside it would be the same names twice, and the
			    flat one would be the less useful of the two. */}
			<FormatSchematic division={division} />
		</section>
	);
}
