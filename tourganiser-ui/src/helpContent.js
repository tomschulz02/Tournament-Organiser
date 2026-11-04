// Copy for the contextual help menu, keyed by topic id. Each page, tab or
// modal registers its own id via useHelpTopic; HelpMenu looks it up here,
// falling back to HELP_TOPICS.fallback when the id is unregistered or
// unknown. See HelpContext.jsx for the registration mechanism itself — this
// file is content only.
//
// Shape: { title, icon, sections: [{ heading?, paragraphs: [string, ...],
// image?: { src, alt } | null }, ...] }. Every topic uses this same shape —
// HelpMenu renders one consistent structure rather than branching on it. A
// section with no heading is fine (the first section of a topic usually has
// none, since the title already says what the reader is looking at); a
// heading is what lets a longer topic name its parts (see
// 'schedule-maker-modal' for the clearest example).
//
// image is null wherever a real screenshot has not been captured yet — see
// the comment on each one for exactly what it should show. Nothing here uses
// a placeholder, mockup or stock image standing in for a real screenshot; a
// missing image is represented by its absence, not by a fake one.
export const HELP_TOPICS = {
	home: {
		title: 'Welcome to Tourganiser',
		icon: 'home',
		sections: [
			{
				paragraphs: [
					'Tourganiser is where you create and run a tournament, or follow one someone else is running.',
					"Use Discover to browse tournaments that are upcoming, ongoing or completed. Sign in to create your own — once you're signed in, the Create button takes its place here and in the navigation.",
				],
			},
			{
				heading: 'Support Tourganiser',
				paragraphs: [
					"Tourganiser is free, with no subscriptions or paywalls. The banner further down this page links to the About page's Support section if you'd like to help cover its running costs — entirely optional.",
				],
			},
		],
	},
	browse: {
		title: 'Discover tournaments',
		icon: 'explore',
		sections: [
			{
				paragraphs: [
					"Every tournament on Tourganiser, grouped into Ongoing, Upcoming and Completed. Tap a tournament's card to open it — its Overview tab is where you'll land.",
					"Signed in? Create takes you to a fresh tournament form. Not signed in yet? You can still look around — you'll only be asked to sign in when you try to create or manage one.",
				],
			},
			{
				heading: 'Following a tournament',
				paragraphs: [
					"Open a tournament and use the Save button beside its name to bookmark it — it'll then show up on your profile under Saved Tournaments, so you can find it again quickly. An organiser doesn't see this on their own tournaments; those already appear on their profile as Created Tournaments.",
				],
			},
		],
	},
	'create-tournament': {
		title: 'Creating a tournament',
		icon: 'add',
		sections: [
			{
				paragraphs: [
					"Start with the tournament's own details — name, location and dates — then add one or more divisions with Add Division. Each division opens in its own screen; see its help entry once one is open for what each of its screens covers.",
					"Nothing is saved to Tourganiser until you finish creating — this whole form, including every division you've added, autosaves as a draft in your browser as you go, so it's safe to navigate away and come back later. If a draft is waiting when you return, you'll be offered the choice to restore it or start fresh.",
				],
			},
			{
				heading: 'Editing and removing a division',
				paragraphs: [
					"Once a division has been added to the form, its card shows Edit and Remove — Edit reopens the same screen you built it in, at whichever step it left off; Remove deletes it from the draft outright, no confirmation needed since nothing has been created yet.",
				],
			},
			{
				heading: 'Reviewing before you create',
				paragraphs: [
					"Once every division is ready, Review shows exactly what will be built — every division's pools and bracket, drawn from the same logic the server uses, not a rough illustration — so you can check it over before anything is created. Create Tournament on that screen is the point of no return; everything before it is still just a draft.",
				],
			},
		],
	},
	'tournament-overview': {
		title: 'Tournament overview',
		icon: 'grid',
		sections: [
			{
				paragraphs: [
					"This is the tournament's dashboard: its details, a card for each division, and what's just happened or is coming up next across the whole tournament.",
				],
			},
			{
				heading: "If you're the organiser",
				paragraphs: [
					'Start Tournament closes team and division editing for good, but the schedule can still be edited and results entered once it has started — a confirmation spells this out before you commit. End Tournament marks an Ongoing tournament as finished. Results can still be corrected afterwards.',
					"Scoresheet Template opens a picker for what prints when anyone downloads a fixture's scoresheet — a built-in FIVB layout, or a PDF of your own with fields placed on it. Deleting the tournament, adding collaborators and each division's ranking and placement options are on the Settings tab.",
					"While the tournament hasn't started, each division's card also offers a way to add or remove divisions — Add Division opens the same screen the creation page uses, and a division's own card can be removed (which takes its teams, fixtures and any scheduled slots with it). Both close once the tournament starts, since the schedule and standings would otherwise be describing a division that no longer matches them.",
				],
			},
			{
				heading: 'Division cards',
				paragraphs: [
					'Each card summarises one division — its team count, fixture count and how far through it is — and links into that division\'s Standings or Teams tab. A viewer sees the same cards without the edit controls.',
				],
			},
		],
	},
	'tournament-settings': {
		title: 'Tournament settings',
		icon: 'structure',
		sections: [
			{
				paragraphs: [
					"This tab holds who else works on the tournament, how each division ranks its teams and plays out its knockout, and deleting the tournament. The organiser sees all of it. A Co-organiser sees only the division options, and nobody else sees the tab.",
				],
			},
			{
				heading: 'Collaborators',
				paragraphs: [
					"Add someone by their email or username, choose a role, and they have it straight away — there's no invitation for them to accept. Changing someone's role or removing them takes effect immediately too; results they already entered stay as they are.",
					"A Scorer enters results for each division's current round and nothing else.",
					'A Match Manager runs the day: as well as scoring, they can correct results in earlier rounds that have not been locked, edit the schedule, advance rounds and print scoresheets. Advancing a round locks it for everyone, you included.',
					"A Co-organiser can also edit teams and divisions, choose the scoresheet template, and start and end the tournament. Only you can manage collaborators or delete the tournament.",
					'You and your collaborators see who entered each result on its fixture. Nobody else does.',
				],
			},
			{
				heading: 'Ranking',
				paragraphs: [
					"Rank teams by chooses what decides pool positions first: matches won, FIVB match points (3 for a clear win, 2 for a win in the deciding set, 1 for a loss in it), simpler match points (2 for any win, 1 for a deciding-set loss) or total sets won. The tiebreakers after it never change. It can be changed at any time, and standings re-sort straight away.",
				],
			},
			{
				heading: 'Placement matches',
				paragraphs: [
					"For a division with a knockout stage, Play for places down to adds real matches for the places below 4th — a 5th place match, a 7th, and so on — instead of settling them by tiebreak. The teams knocked out in each round play for the places between them, the same way the main bracket is drawn. It can only be changed before the knockout stage starts, because it adds and removes fixtures.",
				],
			},
			{
				heading: 'Danger Zone',
				paragraphs: [
					'Delete Tournament removes the whole tournament, including every division, fixture and result. It cannot be undone, and is available at every status.',
				],
			},
		],
	},
	'tournament-fixtures-unscheduled': {
		title: 'Fixtures',
		icon: 'list',
		sections: [
			{
				paragraphs: [
					"Every fixture across every division, in one list grouped by status (Live, Upcoming, Completed, Cancelled), ordered by match number. This tournament doesn't have a schedule yet — fixtures still run and results can still be entered without one; a schedule just adds courts and times.",
				],
			},
			{
				heading: 'Filtering the list',
				paragraphs: [
					'Filter by division (only shown when there is more than one), by stage (Preliminary Round for all pool and round-robin matches, then each knockout round in order, then Playoffs for the 3rd, 5th, 7th… place matches), by status, or search by team name — each control only appears when it would actually narrow something down, so a tournament with one division shows no division filter.',
				],
			},
			{
				heading: 'Entering results and scheduling',
				paragraphs: [
					"Once the tournament has started, the organiser can enter or edit a result on any fixture whose teams are known — look for the score icon on the fixture's row; it opens the score entry screen for that match. A Scorer the organiser has added can do the same for the current round's fixtures, and a Match Manager or Co-organiser for any fixture the organiser can.",
					"If you organise this tournament, Create Schedule opens the schedule builder, where you assign fixtures to courts and times — see its own help entry once it's open.",
				],
			},
		],
	},
	'tournament-fixtures-scheduled': {
		title: 'Schedule',
		icon: 'calendar',
		sections: [
			{
				paragraphs: [
					"This tournament has a schedule, so its fixtures are shown grouped by day, then by time, then by court — what's on, when, and where. The same division, stage, status and team filters as the unscheduled list are available here too.",
				],
			},
			{
				heading: 'Viewing and printing',
				paragraphs: [
					'View/Print Schedule opens a clean, printable version of the whole schedule in a new browser tab — as a grid (courts across, times down) or as a list (one row per fixture) — with its own Print button. This is available to everyone, not just the organiser, and never opens the schedule builder itself.',
				],
			},
			{
				heading: "If you're the organiser",
				paragraphs: [
					"Edit Schedule reopens the schedule builder to make changes — see its own help entry once it's open for what each part of that screen does.",
				],
			},
		],
	},
	'tournament-standings-groups': {
		title: 'Pool / League standings',
		icon: 'structure',
		sections: [
			{
				paragraphs: [
					'Teams in this pool or league, ranked by matches won. Ties are broken by set ratio, then point ratio, then head-to-head, then seed. If this division spans more than one round-robin round (a division playing multiple legs, or set up with a round-robin stage followed by a knockout), the table combines every one of them rather than showing a separate table per round.',
					'Turn on Advanced statistics for the full breakdown behind the ranking — set and point ratios, and a column for every scoreline this division has actually produced (e.g. how many matches finished 2-1).',
				],
			},
			{
				heading: 'Switching division and stage',
				paragraphs: [
					"The selector above the table switches which division you're looking at, when the tournament has more than one. If this division also has a knockout stage or final rankings once they exist, tabs appear here to switch between Pool/League, Knockout and Final Rankings.",
				],
			},
			{
				heading: "If you're the organiser",
				paragraphs: [
					"Once this round is complete, Start Next Round appears here — it proposes who qualifies (or, for a division playing another round-robin leg, the order for that leg), and lets you drag to reorder or swap a team out before confirming it. Nothing changes until you confirm.",
				],
			},
		],
	},
	'tournament-standings-knockout': {
		title: 'Knockout bracket',
		icon: 'structure',
		sections: [
			{
				paragraphs: [
					'The knockout bracket for this division. A match still waiting on an earlier result shows "Winner of..." until that result is in; once pool play has decided who fills the first knockout round, an unbound slot shows the pool position that earns it (e.g. "A1") instead of a bare rank number.',
				],
				image: null, // Screenshot needed: a mid-tournament knockout bracket showing at least one round already decided (real team names) feeding into a round still showing "Winner of #N" placeholders, so the two states are both visible at once.
			},
			{
				heading: "If you're the organiser",
				paragraphs: [
					'Start Next Round appears here too once a knockout round is complete — it works the same way as it does for pool play, one round at a time, with the same reorder-before-confirming option.',
				],
			},
		],
	},
	'tournament-standings-rankings': {
		title: 'Final rankings',
		icon: 'progress',
		sections: [
			{
				paragraphs: [
					'Where every team in this division finished. Places fill in from the bottom as knockout rounds are decided — a team eliminated in an earlier round already has its place before the final has been played — so this can show results before the tournament is finished.',
				],
			},
		],
	},
	'tournament-teams': {
		title: 'Teams',
		icon: 'teams',
		sections: [
			{
				paragraphs: [
					'The teams in this division, in seed order — the order they were entered or last reordered in, which is also what pools and qualifying positions are drawn from.',
				],
			},
			{
				heading: "If you're the organiser and it hasn't started yet",
				paragraphs: [
					"Add a team one at a time, or use \"Add multiple teams\" to paste a whole list at once (one name per line, or comma-separated). Rename a team by editing its name directly, or remove one with its row's remove control.",
					"Reorder teams by dragging a team's handle, or by focusing it and using the up and down arrow keys — the order is the seeding, so this changes how pools and knockout positions are drawn.",
					"Changing which teams are in the division (adding, removing, or reordering them — not just renaming) regenerates its fixtures, so you'll be asked to confirm the pool/qualifier setup again before that happens. This is only offered before the tournament starts and before any result has been recorded.",
				],
			},
		],
	},
	about: {
		title: 'About Tourganiser',
		icon: 'info',
		sections: [
			{
				paragraphs: [
					"Tourganiser is built for organising sports tournaments, with volleyball as the current focus and more sports planned. It's free to use, with no subscriptions, paywalls or ads.",
				],
			},
			{
				heading: 'Support and contact',
				paragraphs: [
					"If you'd like to support its development, the Support Us section on this page has a voluntary donation link. For anything else, this page also lists a support email address and a Discord server.",
				],
			},
		],
	},
	profile: {
		title: 'Your profile',
		icon: 'person',
		sections: [
			{
				paragraphs: [
					"Tournaments you've created, and tournaments you've saved to follow, each in their own paginated list. You'll need to be signed in to see this page.",
				],
			},
			{
				heading: 'Removing a saved tournament',
				paragraphs: [
					"Every card in Saved Tournaments has its own remove control to unfollow it — this only removes it from your list, it has no effect on the tournament itself. Created Tournaments has no such control here; managing or deleting one of your own tournaments happens on its own Overview tab.",
				],
			},
		],
	},
	// --- Modals ------------------------------------------------------------
	//
	// Added per docs/handover-help-menu-expansion.md, Step 2. Each modal calls
	// useHelpTopic with its id so its own content shows in place of whatever
	// topic the page behind it had registered, and the page's topic reverts
	// automatically the instant the modal closes — see HelpContext.jsx.
	'division-modal': {
		title: 'Adding or editing a division',
		icon: 'structure',
		sections: [
			{
				paragraphs: [
					"This form assumes you haven't read anything else about it — everything you need is here. It has up to three screens depending on the format you choose: Basics, Configuration, and Teams.",
				],
			},
			{
				heading: 'Basics',
				paragraphs: [
					'Name the division and choose its format. Round Robin plays every team against every other team once, ranked by a single table with no knockout stage. Pool Play + Knockout splits teams into pools that play among themselves, then sends the best through to a bracket.',
				],
			},
			{
				heading: 'Configuration',
				paragraphs: [
					'Pool Play + Knockout: set how many pools to split the teams into, and how many teams in total advance to the knockout bracket across the whole division — not per pool.',
					"Round Robin: choose between playing every team the same number of times (one or more full round robins — enter how many legs) or limiting each team to an exact number of games below a full round robin. The second option only accepts values that actually work out evenly across the team count you end up with — an invalid combination is explained rather than silently rounded.",
				],
			},
			{
				heading: 'Teams',
				paragraphs: [
					'Add teams one at a time or paste a whole list at once with "Add multiple teams". The order they end up in is the seeding, and can be changed by dragging a team\'s handle or with the arrow keys once it\'s focused — see the Teams tab\'s own help entry for what seed order is used for.',
					'Add Division (or Save Division, when editing one that already exists) validates everything on this screen and the ones before it — a problem sends you back to the screen it belongs to rather than a generic error.',
				],
			},
		],
	},
	'score-update-modal': {
		title: 'Entering a score',
		icon: 'edit',
		sections: [
			{
				paragraphs: [
					'Enter each set\'s score for this fixture as it\'s played, or all at once afterwards. Type a score or use the − and + buttons beside it. Add set adds another set; a set counts for whichever team scored more in it, and a tie counts for neither. The bin icon removes a set entered by mistake.',
				],
			},
			{
				heading: 'Saving, ending and cancelling',
				paragraphs: [
					'Save score records what\'s entered so far without finishing the match — use this to update the score as it happens. End match marks the match finished from the sets entered. Cancel match records the match as cancelled rather than played, which counts for neither team in the standings.',
					'A knockout match needs a winner, so End match stays unavailable while the sets are level. If one team can\'t play, record the walkover as a winning score for the team that goes through. If neither team can play, use Cancel match: neither team goes through, and the team due to meet the winner in the next round gets a walkover instead.',
					'If the match is already finished, this screen instead offers Discard changes and Save changes, for correcting a result after the fact.',
				],
			},
		],
	},
	'next-round-modal': {
		title: 'Starting the next round',
		icon: 'progress',
		sections: [
			{
				paragraphs: [
					"This screen appears once a division's current round is complete and there's another round to move on to — either the qualifiers for a knockout stage, or every team carrying forward into another round-robin leg. Nothing here changes anything until you confirm.",
				],
			},
			{
				heading: 'Reviewing and adjusting the order',
				paragraphs: [
					"The list shows who's progressing, in the order the server calculated from the completed round's results. Use the up and down arrows beside a team to reorder the list (with a mouse you can also drag a team by its handle) — or use the swap control beside a team to substitute it for a different eligible team entirely. Changing the order is recorded as a deliberate adjustment, not silently blended into the calculated ranking.",
					'Beside the list (below it on a phone), a preview shows the matchups (or byes) this order would produce in the next round, updating live as you reorder — for a round-robin leg, every team simply carries forward, so there\'s no bracket to preview there.',
				],
			},
			{
				heading: 'Confirming',
				paragraphs: [
					'Reset to calculated appears once you\'ve changed anything, and puts the list back to the server\'s original order. Start next round confirms the current order and generates or binds the next round\'s fixtures — this is disabled while a team appears twice.',
					'A place shown as No team was left empty by a cancelled knockout match: neither of its teams goes through, so whoever that place is drawn against gets a walkover, shown in the preview. You can leave it empty, or use the swap control to put a team that played the round into it.',
				],
			},
		],
	},
	'scoresheet-template-modal': {
		title: 'Choosing a scoresheet template',
		icon: 'download',
		sections: [
			{
				paragraphs: [
					"What prints when anyone downloads a fixture's scoresheet from this tournament. No template means fixtures show no scoresheet download at all.",
				],
			},
			{
				heading: 'Built-in and custom templates',
				paragraphs: [
					'Two official FIVB layouts (indoor and beach) are built in and ready to use. Upload new template starts your own: pick a PDF, then place a box on it for each piece of information you want prefilled — team names, date, court, division and more — by dragging on the page.',
					"Custom templates live only in this browser's storage, not on the server — they'll show as selected on another device, but only download from the device they were uploaded on. A custom template's row has its own edit control to reposition its fields later without starting over.",
				],
			},
			{
				heading: 'Saving',
				paragraphs: [
					'Select a template card and choose Save to make it this tournament\'s scoresheet template. Selecting "No template" and saving turns the scoresheet download off again.',
				],
			},
		],
	},
	'schedule-maker-modal': {
		title: 'Building the schedule',
		icon: 'calendar',
		sections: [
			{
				paragraphs: [
					"The organiser's tool for assigning fixtures to courts and times. The fixtures list is on the left and the board fills the rest, with the day tabs above it. Everything else opens when you need it: Set up, Auto-schedule and Print from the toolbar, and each match's own details when you click it. Nothing here is visible to anyone but the organiser; everyone else sees the result on the read-only Schedule tab once it's saved.",
				],
				image: null, // Screenshot needed: the full modal open on a multi-day, multi-court schedule with the grid view active and a few fixtures already placed, wide enough to show the day tabs, the board and the inspector together.
			},
			{
				heading: 'The board',
				paragraphs: [
					"Switch between the board (courts across, times down) and a list (one row per placed match) with the Board and List buttons. Each day gets its own tab. A day that's off, which you choose in Set up, says so on its tab: nothing can be placed on it and it isn't auto-scheduled, but it stays in the schedule to switch back on.",
					"The grid lines are only a guide. A match can start at any five-minute mark, cross a line, or share an hour with another match. Drag a fixture from the sidebar onto the board and it lands where you drop it, at its round's length. Drag a placed match to move it, or drag its top or bottom edge to change its length. A match dropped close to another one butts up against it.",
					'While you drag, the board shows where the match would land and outlines the other matches of its teams. If it can\'t go there, for example because a team is playing on another court, the reason appears beside your pointer and dropping it changes nothing. Two teams playing back to back gets a warning, but is allowed.',
					"Click a match to edit it where it sits: its start, length, court, day, officials and notes. Each change applies as you leave the field, and if it can't be done the reason shows there and the match stays as it was. Click or tap any empty time to choose a fixture for it, or drag down an empty court to choose the exact times first.",
				],
			},
			{
				heading: 'Fixtures sidebar',
				paragraphs: [
					"Every fixture that isn't placed on the schedule yet, searchable and filterable by round or division. On a narrow screen where the sidebar and board aren't shown together, tap a fixture here first, then tap the time it belongs at. If that time is taken, it goes to the next free time on that court.",
				],
			},
			{
				heading: 'Breaks',
				paragraphs: [
					'Drag Break from the top of the fixtures list onto the board, or tap it and then tap a time. A new break covers every court for 30 minutes. It opens straight away so you can name it, and you can limit it to one court or change its length there. A lunch break can be dragged like a match.',
				],
			},
			{
				heading: 'Set up',
				paragraphs: [
					"What you have to work with, all in one place: the day's start and end, match lengths, your courts and which days are in use. Placing a fixture by hand and Auto-schedule both read from here. On a phone it's under More in the toolbar.",
					'Match length is what a new match starts at, whether you place it or Auto-schedule does. Give a round its own length under "By round", for example longer finals. Changing a length moves nothing already on the board, and you can drag any one match to change just that match.',
					'Each court can be limited to certain divisions, and clicking a court\'s heading on the board takes you straight to it. Choosing nothing means the court takes any division. "Grid lines every", above the board, only changes how the board is ruled.',
				],
			},
			{
				heading: 'Auto-schedule',
				paragraphs: [
					'Auto-schedule (in the toolbar) fills the whole board at once from your set up, following the rules you choose. It works through the day like you would on a whiteboard. At each time it plays the matches whose teams have the most still to play, in any order within a round. Divisions sharing a court take turns whenever that finishes sooner. Your settings are saved with the schedule.',
					'Some rules always apply: rounds are played in order (no knockout match starts until every pool match of its division has finished), no team or court is double-booked, and courts limited to certain divisions are respected. Four rules are yours to switch: a minimum rest between a team\'s matches (off allows back-to-back matches), a maximum number of matches per team per day, the longest a team should wait between two matches on the same day (teams near it play first; a longer wait is reported), and a break before each knockout round (minimum rest can\'t cover knockout teams, because they aren\'t known in advance). After a break in play, courts restart the moment the break ends.',
					'With "Bend rules to fit every fixture" on, a fixture that has nowhere else to go may shorten a rest or a knockout break, or exceed the daily limit. The generator bends as few times as it can and spreads the bends across teams instead of repeating them for one. "Run past the day\'s end time" is the last resort. It adds time after the final day only when bending isn\'t enough. The Generation Report above the board lists every bend with the teams affected. Show highlights those matches on the board. Anything still left out is listed with the rule that stopped it.',
					'Preferences decide the court, never whether a match plays: keeping a pool on one court, and keeping a court on one division. "Spread matches evenly across days" shares the matches between days instead of finishing as early as possible. Officials can also be assigned automatically, kept off by default.',
					'Auto-schedule replaces whatever is currently on the board — any hand-placed matches are discarded and placed again with everything else. Breaks are kept.',
				],
			},
			{
				heading: 'Saving, discarding and printing',
				paragraphs: [
					"Save Schedule writes the schedule to the tournament — nothing is visible to anyone else until this is pressed. Under More, Discard Changes reverts everything back to what was last saved, and Reset Schedule empties the board entirely (previously saved matches included), which only takes effect once you save afterwards.",
					'Print shows where the pages break, with Grid and List to choose between, and you can move any break there. Print this layout opens the printable document in a new tab with its own Print button, using whatever is on the board, saved or not. Page breaks are saved with the rest of the schedule.',
				],
			},
		],
	},
	fallback: {
		title: 'Help',
		icon: 'info',
		sections: [
			{
				paragraphs: [
					"There isn't anything specific to explain about this page yet. If you're not sure where to start, Discover (to browse tournaments) and Create (to start your own) are the two main things Tourganiser is for.",
				],
			},
		],
	},
};
