// The What's new popup's content. `release` is the one switch: the popup shows to
// everyone who has not dismissed or closed it for this exact string, so writing
// the next release's slides and changing `release` is what shows it again. See
// docs/decisions.md, "What's New Is Keyed To A Release".
//
// slides: [{ id, title, text: [string], media? }], with media in the help shape
// ({ type: 'image' | 'animation', src, still?, phoneSrc?, phoneStill?, alt }).
// Files live in public/assets/whats-new/, named whats-new-<release>--<slide id>.
// No slides means the popup never shows.
export const WHATS_NEW = {
	release: '1.1',
	slides: [
		{
			id: 'collaborators',
			title: 'Run it with your team',
			text: [
				'Add people to a tournament by username or email under Settings → Collaborators, and give each one a role.',
				'A Scorer enters results for the current round. A Match Manager can also correct earlier results, edit the schedule and start the next round. A Co-organiser can also change teams and divisions and start or end the tournament.',
			],
			media: {
				type: 'image',
				src: '/assets/whats-new/whats-new-1-1--collaborators.webp',
				phoneSrc: '/assets/whats-new/whats-new-1-1--collaborators--phone.webp',
				alt: 'A table of what a Scorer, a Match Manager and a Co-organiser can each do',
			},
		},
		{
			id: 'rules',
			title: 'Your rules, per division',
			text: [
				'Choose how teams are drawn into pools — Snake, Straight or Seeded pots — how the table is ranked, and the order of its tiebreaks.',
				'Decide which places are played for, from a final only down to a 3rd-place match and beyond. All of it is set per division, when you create it or later in Settings.',
			],
			media: {
				type: 'animation',
				src: '/assets/whats-new/whats-new-1-1--rules.webp',
				still: '/assets/whats-new/whats-new-1-1--rules--still.webp',
				phoneSrc: '/assets/whats-new/whats-new-1-1--rules--phone.webp',
				phoneStill: '/assets/whats-new/whats-new-1-1--rules--phone-still.webp',
				alt: 'Reordering tiebreak deciders in Settings',
			},
		},
		{
			id: 'schedule',
			title: 'A schedule maker that works like a calendar',
			text: [
				'Drag fixtures onto courts and times, drag a match to move it, or drag its edge to change its length. Matches snap to five minutes and can start at any time, not just on a grid line.',
				'Auto-schedule still fills the whole board for you, and Undo takes back one change at a time.',
			],
			media: {
				type: 'animation',
				src: '/assets/whats-new/whats-new-1-1--schedule.webp',
				still: '/assets/whats-new/whats-new-1-1--schedule--still.webp',
				alt: 'Moving a match to another court and making it longer',
			},
		},
		{
			id: 'tournament-view',
			title: 'A new look, and results on paper',
			text: [
				"Every tournament now opens on an Overview of what's on court now and what's up next, and the home page has been redesigned.",
				'Organisers can print fixture results, the final results, or a full results pack with a cover.',
			],
			media: {
				type: 'image',
				src: '/assets/whats-new/whats-new-1-1--tournament-view.webp',
				phoneSrc: '/assets/whats-new/whats-new-1-1--tournament-view--phone.webp',
				alt: "A tournament's Overview with the matches on court now and up next",
			},
		},
	],
};
