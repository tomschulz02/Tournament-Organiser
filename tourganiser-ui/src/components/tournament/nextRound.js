// The next round's pairings, worked out from what fetchRoundProgression
// returns. Shared by NextRoundModal (the confirm step) and the organiser's
// next-round preview on Standings, so both show the same matchups.
//
// A separate module because a file exporting both components and plain
// functions breaks Fast Refresh, which the lint config enforces.

// The client mirror of bindFixturesToResults in progression.service.js: a
// knockout group holds either one index (a bye, the team named there advances
// unplayed) or two (a match between the teams at those positions). Read
// against the organiser's current, possibly-reordered `selectedIds` rather than
// the server's confirmed list, so the preview updates before anything is saved.
// Ported rather than shared for the same reason divisionPreview.js is: there is
// no frontend/backend module boundary to import a server file across.
//
// A group the round lists under `placement` is a match for places below the
// title, labelled with its fixture round's own text ("Places 5-8", "5th Place"),
// and a one-team placement group is a team waiting for its placement final
// rather than a bye into the next round of the bracket.
export function nextRoundFixtures(groups, selectedIds, placement = []) {
	if (!Array.isArray(groups)) return [];

	const placementByGroup = new Map((placement ?? []).map((entry) => [entry.group, entry]));

	return groups
		.map((group, groupIndex) => {
			if (!Array.isArray(group) || group.length === 0) return null;

			const entry = placementByGroup.get(groupIndex);
			const label = entry?.name ? entry.name.split(' · ').pop() : null;

			if (group.length < 2) {
				const index = group[0];
				if (!Number.isInteger(index)) return null;

				return { type: entry ? 'waiting' : 'bye', teamId: selectedIds[index] ?? null };
			}

			const [one, two] = group;
			if (!Number.isInteger(one) || !Number.isInteger(two)) return null;

			return { type: 'match', team1Id: selectedIds[one] ?? null, team2Id: selectedIds[two] ?? null, label };
		})
		.filter(Boolean);
}
