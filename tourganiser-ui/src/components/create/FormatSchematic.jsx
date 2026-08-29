import BracketView from '../tournament/BracketView';
import { isConfigurableFormat } from './divisionFormats';
import { poolMembership, previewBracket } from './divisionPreview';

// What this division's configuration will produce.
//
// No longer an illustration. Pool membership and the bracket's shape come from
// divisionPreview.js, which mirrors the server's own generation, so the pools
// named here are the pools the tournament will actually hold and the teams in
// them are the teams that will be drawn into them. The review is the last moment
// the seeding can be checked before a rebuild is the only way to change it, and
// a preview that cannot say who meets whom in the pool stage does not answer the
// question being asked of it.
//
// BracketView is fed directly rather than copied. It already renders rank
// placeholders — a knockout fixture exists before the pool feeding it has
// finished — so a preview is that same case rather than a special one.

// getGroupLabel in api/src/utils/tournamentViewFormatter.js, which is what the
// standings will call these once the tournament exists.
function groupLabel(index) {
	return `Group ${String.fromCharCode(65 + index)}`;
}

export default function FormatSchematic({ division }) {
	const configurable = isConfigurableFormat(division.type);

	// A Round Robin division is a single pool that plays itself out, with
	// nothing after it.
	const pools = poolMembership(division.teams.length, configurable ? division.num_groups : 1);
	const rounds = configurable ? previewBracket(division.knockout_teams) : [];

	return (
		<div className="ct-schematic">
			<div className="ct-schematic-stage">
				<p className="ct-schematic-stage-name">{configurable ? 'Pools' : 'The table'}</p>

				{/* Its own scrolling axis. A division with eight pools is wider
				    than a phone, and shrinking it until it cannot be read is
				    worse than asking someone to swipe. */}
				<div className="ct-schematic-pools">
					{pools.map((members, index) => (
						<div key={index} className="ct-schematic-pool">
							{/* Named only where there is more than one, as
							    StandingsTab names its groups: a single pool's
							    label repeats what the heading above already says. */}
							{pools.length > 1 && <span className="ct-schematic-pool-name">{groupLabel(index)}</span>}
							<span className="ct-schematic-pool-count">
								{members.length} {members.length === 1 ? 'team' : 'teams'}
							</span>

							{/* Ordered, because the position within a pool is the
							    seeding the serpentine gave it. */}
							<ol className="ct-schematic-pool-teams">
								{members.map((position) => (
									<li key={position} className="ct-schematic-pool-team">
										{division.teams[position].name}
									</li>
								))}
							</ol>
						</div>
					))}
				</div>
			</div>

			<div className="ct-schematic-stage">
				<p className="ct-schematic-stage-name">Knockout</p>
				{rounds.length > 0 ? (
					<BracketView rounds={rounds} />
				) : (
					<p className="ct-schematic-note">
						{configurable
							? 'No knockout stage — fewer than two teams advance from the pools.'
							: 'No knockout stage. The table decides the division.'}
					</p>
				)}
			</div>
		</div>
	);
}
