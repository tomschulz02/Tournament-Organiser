import { isConfigurableFormat } from './divisionFormats';

// An illustration of the shape a division's configuration will produce.
//
// It is NOT the bracket that will be created — no draw has been made, no team
// has been placed, and the real structure is built by the server at creation
// time. It exists so the organiser can see the scale and shape of what they
// configured before committing to it, which is why it shows counts and round
// names rather than teams and fixtures.
//
// BracketView is deliberately not used here: it renders division.bracket.rounds,
// a server-built structure that does not exist before creation.

// A faithful mirror of populateGroups in api/src/services/divisions.service.js.
//
// The assignment is serpentine — group 1 takes the first team, then counts back
// from the end of the second row — so the sizes are not simply "remainder into
// the earlier pools". The index arithmetic is copied rather than approximated,
// so a pool the organiser is shown as holding four teams really does hold four.
function poolSizes(teamCount, poolCount) {
	const groups = Math.max(1, Math.floor(poolCount) || 1);
	const perGroup = Math.ceil(teamCount / groups);
	const sizes = [];

	for (let groupNo = 1; groupNo <= groups; groupNo++) {
		let size = 0;

		for (let index = 0; index < perGroup; index++) {
			const position = index % 2 === 0 ? index * groups + groupNo - 1 : (index + 1) * groups - groupNo;
			// The generator skips an index past the end of the team list; here
			// that is simply a place the pool does not get filled.
			if (position < teamCount) size += 1;
		}

		sizes.push(size);
	}

	return sizes;
}

function roundName(teamsInRound) {
	if (teamsInRound === 2) return 'Finals';
	if (teamsInRound === 4) return 'Semifinals';
	if (teamsInRound === 8) return 'Quarterfinals';

	return `Round of ${teamsInRound}`;
}

// Halving from the qualifier count. A count that is not a power of two opens
// with a smaller qualifying round and lets the rest through on a bye.
function knockoutRounds(qualifiers) {
	const total = Math.floor(Number(qualifiers));
	if (!Number.isFinite(total) || total < 2) return [];

	const rounds = [];
	const base = 2 ** Math.floor(Math.log2(total));

	if (total > base) {
		const byes = 2 * base - total;
		rounds.push({
			name: `Round of ${total}`,
			matches: total - base,
			note: `${byes} ${byes === 1 ? 'team goes' : 'teams go'} straight through`,
		});
	}

	for (let size = base; size >= 2; size /= 2) {
		rounds.push({
			name: roundName(size),
			// The Finals round is the exception: a third place playoff is
			// generated alongside the final, so it holds two matches and consumes
			// four places rather than two. See docs/tournament-rules.md.
			matches: size === 2 ? 2 : size / 2,
			note: size === 2 ? 'the final and the third place playoff' : null,
		});
	}

	return rounds;
}

export default function FormatSchematic({ division }) {
	const teamCount = division.teams.length;
	const configurable = isConfigurableFormat(division.type);

	// A Round Robin division is a single pool that plays itself out, with
	// nothing after it.
	const sizes = configurable ? poolSizes(teamCount, division.num_groups) : [teamCount];
	const rounds = configurable ? knockoutRounds(division.knockout_teams) : [];

	return (
		<div className="ct-schematic">
			<p className="ct-schematic-caption">
				An example of how this division will be structured. The teams are drawn when the tournament is created, so this
				is not the final bracket.
			</p>

			<div className="ct-schematic-stage">
				<p className="ct-schematic-stage-name">{configurable ? 'Pools' : 'The table'}</p>
				{/* Its own scrolling axis. A division with eight pools is wider
				    than a phone, and shrinking it until it cannot be read is
				    worse than asking someone to swipe. */}
				<div className="ct-schematic-pools">
					{sizes.map((size, index) => (
						<div key={index} className="ct-schematic-pool">
							<span className="ct-schematic-pool-name">
								{configurable ? `Pool ${String.fromCharCode(65 + index)}` : 'Everyone'}
							</span>
							<span className="ct-schematic-pool-count">
								{size} {size === 1 ? 'team' : 'teams'}
							</span>
						</div>
					))}
				</div>
			</div>

			{rounds.length > 0 && (
				<div className="ct-schematic-stage">
					<p className="ct-schematic-stage-name">Knockout</p>
					<ol className="ct-schematic-rounds">
						{rounds.map((round) => (
							<li key={round.name} className="ct-schematic-round">
								<span className="ct-schematic-round-name">{round.name}</span>
								<span className="ct-schematic-round-detail">
									{round.matches} {round.matches === 1 ? 'match' : 'matches'}
									{round.note && ` — ${round.note}`}
								</span>
							</li>
						))}
					</ol>
				</div>
			)}
		</div>
	);
}
