// Copy for the contextual help menu, keyed by topic id. Each page or tab
// registers its own id via useHelpTopic; HelpMenu looks it up here, falling
// back to HELP_TOPICS.fallback when the id is unregistered or unknown.
export const HELP_TOPICS = {
	home: {
		title: 'Welcome to Tourganiser',
		icon: 'home',
		paragraphs: [
			'Tourganiser is where you create and run a tournament, or follow one someone else is running.',
			"Use Discover to browse tournaments that are upcoming, ongoing or completed. Sign in to create your own — once you're signed in, the Create button takes its place here and in the navigation.",
		],
	},
	browse: {
		title: 'Discover tournaments',
		icon: 'explore',
		paragraphs: [
			"Every tournament on Tourganiser, grouped into Ongoing, Upcoming and Completed. Tap a tournament to open it — its Overview tab is where you'll land.",
			"Signed in? Create takes you to a fresh tournament form. Not signed in yet? You can still look around — you'll only be asked to sign in when you try to create or manage one.",
		],
	},
	'create-tournament': {
		title: 'Creating a tournament',
		icon: 'add',
		paragraphs: [
			"Start with the tournament's own details — name, location and dates — then add one or more divisions. Each division opens in its own screen where you choose a format (Round Robin, or pools leading into a knockout), set up pools and qualifiers if the format has them, and add your teams.",
			"Nothing is saved to Tourganiser until you finish — this whole form autosaves as a draft in your browser as you go, so it's safe to navigate away and come back later.",
			"Before you create the tournament, Review shows you exactly what will be built — every division's pools and bracket — so you can check it over first.",
		],
	},
	'tournament-overview': {
		title: 'Tournament overview',
		icon: 'grid',
		paragraphs: [
			"This is the tournament's dashboard: its details, a card for each division, and what's just happened or is coming up next.",
			"If you created this tournament, you'll see controls here to start it, end it, and — while it hasn't started yet — add or remove divisions. Everyone else sees a read-only view.",
		],
	},
	'tournament-fixtures-unscheduled': {
		title: 'Fixtures',
		icon: 'list',
		paragraphs: [
			"Every fixture across every division, in one list, filterable by round and by status. This tournament doesn't have a schedule yet — fixtures still run and results can still be entered without one; a schedule just adds courts and times.",
			"Once the tournament has started, the organiser can enter or edit a result on any fixture whose teams are known — look for the score icon on the fixture's row.",
			'If you organise this tournament, Create Schedule opens the schedule builder, where you assign fixtures to courts and times.',
		],
	},
	'tournament-fixtures-scheduled': {
		title: 'Schedule',
		icon: 'calendar',
		paragraphs: [
			"This tournament has a schedule, so its fixtures are shown grouped by day, then by time, then by court — what's on, when, and where.",
			'The organiser can reopen the schedule builder with Edit Schedule to make changes, and print or export it from inside that screen.',
		],
	},
	'tournament-standings-groups': {
		title: 'Pool / League standings',
		icon: 'structure',
		paragraphs: [
			'Teams in this pool or league, ranked by matches won. Ties are broken by set ratio, then point ratio, then head-to-head, then seed. Turn on Advanced statistics for the full breakdown behind the ranking.',
			'If you organise this tournament and the round is complete, Start Next Round appears here — it proposes who qualifies, and lets you review or adjust the list before confirming it.',
		],
	},
	'tournament-standings-knockout': {
		title: 'Knockout bracket',
		icon: 'structure',
		paragraphs: [
			'The knockout bracket for this division. A match still waiting on an earlier result shows "Winner of..." until that result is in.',
			'If you organise this tournament, Start Next Round appears here too once a knockout round is complete — it works the same way as it does for pool play, one round at a time.',
		],
	},
	'tournament-standings-rankings': {
		title: 'Final rankings',
		icon: 'progress',
		paragraphs: [
			'Where every team in this division finished. Places fill in from the bottom as knockout rounds are decided, so this can show results before the final has been played.',
		],
	},
	'tournament-teams': {
		title: 'Teams',
		icon: 'teams',
		paragraphs: [
			"The teams in this division, in seed order. If you organise this tournament and it hasn't started yet, you can add, rename or reorder them here — drag a team's handle, or use the arrow keys once it's focused.",
			"Changing which teams are in the division (not just renaming them) regenerates its fixtures, so you'll be asked to confirm before that happens.",
		],
	},
	about: {
		title: 'About Tourganiser',
		icon: 'info',
		paragraphs: [
			"Tourganiser is built for organising sports tournaments, with volleyball as the current focus and more sports planned. It's free to use, with no subscriptions or paywalls.",
			"If you'd like to support its development, there's a donation link on this page — entirely optional.",
		],
	},
	profile: {
		title: 'Your profile',
		icon: 'person',
		paragraphs: [
			"Tournaments you've created, and tournaments you've saved to follow, each in their own list. You'll need to be signed in to see this page.",
		],
	},
	fallback: {
		title: 'Help',
		icon: 'info',
		paragraphs: [
			"There isn't anything specific to explain about this page yet. If you're not sure where to start, Discover (to browse tournaments) and Create (to start your own) are the two main things Tourganiser is for.",
		],
	},
};
