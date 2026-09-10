import CreateModal from './CreateModal';
import FormatSchematic from './FormatSchematic';
import Icon from '../Icons';
import LoadingScreen from '../LoadingScreen';
import { getFormatLabel } from './divisionFormats';
import { totalMatches } from './divisionPreview';

// Classic reads its match count from pools and a knockout stage. League has
// neither — its count is either N full cycles (legs mode) or an exact
// g-regular pairing (limited mode), mirroring createLeagueState/
// generatePartialRoundRobinPairs in api/src/services/. Games per team is kept
// as a target and rounded via the same "even n*g" logic those functions
// validate, so a mid-typing invalid value still shows a sane number rather
// than NaN.
function divisionMatches(division) {
	if (division.type === 'classic') {
		return totalMatches(division.teams.length, division.num_groups, division.knockout_teams);
	}

	if (division.type === 'league') {
		const teamCount = division.teams.length;

		if (division.roundRobinMode === 'limited') {
			const g = Number(division.gamesPerTeam) || 0;
			return Math.floor((teamCount * g) / 2);
		}

		const legs = Math.max(1, Number(division.roundRobinLegs) || 1);
		return legs * ((teamCount * (teamCount - 1)) / 2);
	}

	return totalMatches(division.teams.length, 1, 0);
}

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
	const totalMatchCount = divisions.reduce((sum, division) => sum + divisionMatches(division), 0);

	const footer = (
		<>
			<div className="ct-modal-footer-left" />
			<div className="ct-modal-footer-right">
				<button type="button" className="ct-button ct-button-quiet" onClick={onClose} disabled={isCreating}>
					Close
				</button>
				<button type="button" className="ct-button ct-button-primary" onClick={onCreate} disabled={isCreating}>
					{isCreating && <LoadingScreen variant="inline" />}
					<span>{isCreating ? 'Creating…' : 'Create Tournament'}</span>
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
								{divisions.length} {divisions.length === 1 ? 'division' : 'divisions'}, {totalTeams} teams,{' '}
								{totalMatchCount} {totalMatchCount === 1 ? 'match' : 'matches'}
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
				{division.type === 'classic' && (
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
				{division.type === 'league' && (
					<div className="ct-review-fact">
						<dt>{division.roundRobinMode === 'limited' ? 'Games per team' : 'Legs'}</dt>
						<dd>{division.roundRobinMode === 'limited' ? division.gamesPerTeam : division.roundRobinLegs}</dd>
					</div>
				)}
				<div className="ct-review-fact">
					<dt>Matches</dt>
					<dd>{divisionMatches(division)}</dd>
				</div>
			</dl>

			{/* Every team appears here, inside the pool it will be drawn into.
			    A flat list beside it would be the same names twice, and the
			    flat one would be the less useful of the two. */}
			<FormatSchematic division={division} />
		</section>
	);
}
