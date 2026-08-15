import Icon from '../Icons';
import { getFormatLabel, isConfigurableFormat } from './divisionFormats';

// A division at a glance, on the creation page.
//
// Name, format, team count, and the pool count where the format has one. The
// number of teams advancing is deliberately absent: it is a configuration
// detail rather than an identifying one, and it belongs in the editor and the
// review. Putting it here would make the card a form summary instead of a
// label.
export default function DivisionCard({ division, onEdit, onRemove }) {
	const teamCount = division.teams.length;
	const showPools = isConfigurableFormat(division.type);

	return (
		<div className="ct-division-card">
			<div className="ct-division-body">
				<p className="ct-division-name">{division.name || 'Unnamed division'}</p>
				<p className="ct-division-format">{getFormatLabel(division.type)}</p>
				<div className="ct-division-facts">
					<span className="ct-division-fact">
						{teamCount} {teamCount === 1 ? 'team' : 'teams'}
					</span>
					{showPools && (
						<span className="ct-division-fact">
							{division.num_groups} {Number(division.num_groups) === 1 ? 'pool' : 'pools'}
						</span>
					)}
				</div>
			</div>

			{/* Present but quiet. The card is a label first; these are what you do
			    to it, not what it is for. */}
			<div className="ct-division-actions">
				<button type="button" className="ct-division-action" onClick={onEdit}>
					<Icon name="edit" size={18} />
					<span>Edit</span>
					<span className="ct-visually-hidden">{division.name || 'this division'}</span>
				</button>
				<button type="button" className="ct-division-action ct-division-action-remove" onClick={onRemove}>
					<Icon name="exit" size={18} />
					<span>Remove</span>
					<span className="ct-visually-hidden">{division.name || 'this division'}</span>
				</button>
			</div>
		</div>
	);
}
