// Copy for the help, keyed by topic id. Each page, tab or modal registers its
// own id via useHelpTopic; the help modal (components/HelpModal.jsx) opens on
// it, falling back to HELP_TOPICS.fallback when the id is unregistered or
// unknown. A "?" button (components/HelpButton.jsx) opens a topic at one of its
// sections. See HelpContext.jsx for the mechanism itself — this file is
// content only.
//
// Shape: { title, icon, sections: [section, ...] }, where a section is
//   {
//     id,            stable kebab-case slug, unique within the topic. A "?"
//                    button opens help at a topic and one of these ids.
//     heading?,      none on a topic's first section, usually: the title
//                    already says what the reader is looking at.
//     paragraphs?,   [string, ...]
//     table?,        the name of a table in components/helpTables.js
//     media?,        { type: 'image' | 'animation', src, alt, still?,
//                      phoneSrc?, phoneStill? } — phone* are the phone-width
//                      captures; see components/HelpSteps.jsx.
//     steps?,        [{ text: [string, ...], media? }] — a walkthrough, shown
//                    one step at a time with Back and Next.
//   }
// Every topic uses this same shape, so the help modal renders one consistent
// structure rather than branching on it. An animation is an animated WebP and
// carries a `still`, shown under reduced motion.
//
// Walkthroughs, not walls of text: a feature that is a sequence of actions is
// a stepper, a single idea is a paragraph, and a step is a sentence or two.
//
// The on-screen explanations that used to sit on the pages live here now (see
// docs/decisions.md, "Help Is A Modal Of Topics"). The pages keep labels, controls, live
// status and a "?" that opens the matching section.
//
// The "Shot:" comment beside each media item says what its capture shows, and is
// the shot list for recapturing. The files are public/assets/help/<topic>--<section>
// [--<step>].webp, with --still, --phone and --phone-still variants. A media item
// without a src was left uncaptured on purpose (it would show other people's
// tournaments or accounts, or needs one you didn't create) and renders nothing.
// Nothing here uses a placeholder, mockup or stock image standing in for a real
// capture; a missing image is represented by its absence, not by a fake one.
export const HELP_TOPICS = {
	home: {
		title: 'Welcome to Tourganiser',
		icon: 'home',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'Tourganiser is where you create and run a tournament, or follow one someone else is running.',
					"Use Discover to browse tournaments that are upcoming, ongoing or completed. Sign in to create your own — once you're signed in, Create takes you straight to a new tournament.",
				],
				media: {
					type: 'image',
					src: '/assets/help/home--intro.webp',
					phoneSrc: '/assets/help/home--intro--phone.webp',
					alt: 'The Tourganiser home page',
				}, // Shot: the home page, top of the page, signed out.
			},
			{
				id: 'support-tourganiser',
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
				id: 'intro',
				paragraphs: [
					"Every tournament on Tourganiser, grouped into Ongoing, Upcoming and Completed. Tap a tournament's card to open it — its Overview tab is where you'll land.",
					"Not signed in yet? You can still look around — you'll only be asked to sign in when you try to create or manage one.",
				],
				media: { type: 'image', alt: 'The Discover page with tournaments grouped by status' }, // Shot: Discover at desktop width, with the Ongoing and Completed groups visible.
			},
			{
				id: 'following-a-tournament',
				heading: 'Following a tournament',
				steps: [
					{
						text: ['Open a tournament and press Save beside its name.'],
						media: { type: 'animation', alt: 'Pressing Save on a tournament' }, // Shot: a tournament header, pressing Save, the button filling in.
					},
					{
						text: [
							"It now shows on your profile under Saved Tournaments, so you can find it again quickly. An organiser doesn't see Save on their own tournaments — those are already on their profile.",
						],
						media: { type: 'image', alt: 'Saved Tournaments on the profile page' }, // Shot: the profile page's Saved Tournaments list with one card.
					},
				],
			},
		],
	},
	'create-tournament': {
		title: 'Creating a tournament',
		icon: 'add',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'Start with the tournament itself — what it is called, where and when it runs. Then add a division for each competition within it. Nothing is created until you review and confirm.',
				],
				steps: [
					{
						text: ['Fill in the name, location and dates. A description is optional.'],
						media: {
							type: 'image',
							src: '/assets/help/create-tournament--intro--1.webp',
							phoneSrc: '/assets/help/create-tournament--intro--1--phone.webp',
							alt: 'The tournament details form',
						}, // Shot: the create page's details form, filled in with test values.
					},
					{
						text: [
							'Press Add Division for each competition — Men’s Open, Under 19, Mixed B. Each opens in its own screen; its help entry covers what each screen does.',
						],
						media: {
							type: 'animation',
							src: '/assets/help/create-tournament--intro--2.webp',
							still: '/assets/help/create-tournament--intro--2--still.webp',
							phoneSrc: '/assets/help/create-tournament--intro--2--phone.webp',
							phoneStill: '/assets/help/create-tournament--intro--2--phone-still.webp',
							alt: 'Adding a division',
						}, // Shot: pressing Add Division, the division modal opening, and the new division card appearing after Add Division.
					},
					{
						text: ['Press Review Tournament to check what will be built, then Create Tournament.'],
						media: {
							type: 'image',
							src: '/assets/help/create-tournament--intro--3.webp',
							phoneSrc: '/assets/help/create-tournament--intro--3--phone.webp',
							alt: 'The review screen',
						}, // Shot: the review modal for a tournament with two divisions.
					},
				],
			},
			{
				id: 'details',
				heading: 'Tournament details',
				paragraphs: [
					'The description is optional. Put anything a visitor should know there — the venue, the format, who to contact.',
				],
			},
			{
				id: 'draft',
				heading: 'Your draft is saved as you go',
				paragraphs: [
					"Nothing is saved to Tourganiser until you finish creating — the whole form, including every division you've added, autosaves as a draft in your browser, so it's safe to navigate away and come back later. If a draft is waiting when you return, you'll be offered the choice to restore it or start fresh.",
				],
			},
			{
				id: 'editing',
				heading: 'Editing and removing a division',
				paragraphs: [
					"Once a division has been added, its card shows Edit and Remove. Edit reopens the screen you built it in; Remove deletes it from the draft outright, with no confirmation, since nothing has been created yet.",
				],
			},
			{
				id: 'reviewing',
				heading: 'Reviewing before you create',
				paragraphs: [
					"Nothing has been created yet. Review shows exactly what will be built — every division's pools and bracket, drawn from the same logic the server uses, not a rough illustration — so you can check it over first. Create Tournament on that screen is the point of no return; everything before it is still just a draft.",
				],
			},
		],
	},
	'tournament-overview': {
		title: 'Tournament overview',
		icon: 'grid',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"The tournament's dashboard. Everyone sees what is on court now, what is up next, recent results and a card for each division. Once the tournament is finished, the final results lead the page.",
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-overview--intro.webp',
					phoneSrc: '/assets/help/tournament-overview--intro--phone.webp',
					alt: 'The Overview of an ongoing tournament',
				}, // Shot: the Overview of an ongoing tournament as a spectator, showing On court now and Up next.
			},
			{
				id: 'organiser',
				heading: 'If you run the tournament',
				paragraphs: [
					'The organiser and collaborators get more at the top. Your queue lists what needs you: a time slot whose matches finished without a result, a division whose round is complete and ready to move on, and the next slot’s scoresheets to print.',
					"Today's timeline shows every court's slots at a glance — done, live, missing a result, or upcoming — with Edit schedule beside it for those who can change the schedule.",
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-overview--organiser.webp',
					phoneSrc: '/assets/help/tournament-overview--organiser--phone.webp',
					alt: 'Your queue and the day timeline',
				}, // Shot: Your queue with at least one item, and the timeline below it, as the organiser.
			},
			{
				id: 'lifecycle',
				heading: 'Starting and ending the tournament',
				paragraphs: [
					'Start Tournament closes team and division editing for good, but the schedule can still be edited and results entered once it has started — a confirmation spells this out before you commit. End Tournament marks an Ongoing tournament as finished. Results can still be corrected afterwards.',
					"While the tournament hasn't started, Add Division opens the same screen the creation page uses, and a division's card can be removed — which takes its teams, fixtures and any scheduled slots with it. Both close once the tournament starts.",
				],
			},
			{
				id: 'results-pack',
				heading: 'Results pack',
				paragraphs: [
					"Results pack, shown to the organiser and collaborators once a match has been completed, opens a printable pack of the whole tournament in a new tab: a cover, the final ranking, then each division's standings, results and knockout bracket.",
				],
			},
			{
				id: 'division-cards',
				heading: 'Division cards',
				paragraphs: [
					"Each card summarises one division — its team count, fixture count and how far through it is — and links into that division's Standings or Teams tab. Collaborators, ranking and scoresheet options are on the Settings tab.",
				],
			},
		],
	},
	'tournament-settings': {
		title: 'Tournament settings',
		icon: 'structure',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"This tab holds who else works on the tournament, how each division draws, ranks and finishes, the scoresheet, the tournament's status, and deleting it. The organiser sees all of it. A Co-organiser sees everything except collaborators and deleting, and nobody else sees the tab.",
				],
			},
			{
				id: 'collaborators',
				heading: 'Collaborators',
				paragraphs: [
					'Who else can work on this tournament, and what each role can do. Each role can do everything the roles before it can:',
				],
				table: 'roleCapabilities',
				steps: [
					{
						text: ['Search for someone by username, or type their full email address.'],
						media: { type: 'animation', alt: 'Searching for a collaborator' }, // Shot: typing a test username in Add a collaborator and the suggestion list appearing.
					},
					{
						text: [
							"Choose a role and press Add. They have it straight away — there's no invitation for them to accept.",
						],
						media: { type: 'image', alt: 'A collaborator added with a role' }, // Shot: the collaborator list with one test account in it.
					},
					{
						text: [
							'Change their role from the list, or remove them with the bin. Both take effect immediately; results they already entered stay as they are.',
						],
						media: { type: 'image', alt: 'Changing a collaborator’s role' }, // Shot: a collaborator row with its role menu open.
					},
				],
			},
			{
				id: 'roles-explained',
				heading: 'What the roles are for',
				paragraphs: [
					"A Scorer enters results for each division's current round and nothing else.",
					'A Match Manager runs the day: as well as scoring, they can correct results in earlier rounds that have not been locked, edit the schedule, advance rounds and print scoresheets. Advancing a round locks it for everyone, the organiser included.',
					'A Co-organiser can also change teams and divisions, choose the scoresheet template, and start and end the tournament. Making someone a Co-organiser asks you to confirm first.',
					'Only the organiser can manage collaborators and delete the tournament. The organiser and collaborators see who entered each result on its fixture. Nobody else does.',
				],
			},
			{
				id: 'divisions',
				heading: 'Divisions',
				paragraphs: [
					'How each division draws its pools, ranks its teams, and how far down its knockout plays. Pick a division with the chips at the top; every control below applies to that one and saves as soon as it changes.',
					"Copy to all divisions gives every other division the ranking and tiebreak deciders of the one selected. Their tables re-sort straight away. Placement matches are not copied, because they depend on each division's own knockout.",
				],
			},
			{
				id: 'pool-draw',
				heading: 'Pool draw',
				paragraphs: [
					'How seeds are placed into pools, for a Pool Play + Knockout division. Every draw gives the same pool sizes; only which seed lands in which pool differs.',
					'Snake (the default) deals the seeds across the pools and back again, so pools stay even. Straight fills one pool at a time with consecutive seeds. Seeded pots puts the top seeds one per pool, then draws each later group of seeds at random into the pools; Redraw makes a new random draw.',
					"Changing the draw, or Redraw, rebuilds this division's pools and fixtures and takes its matches off the schedule. Reordering seeds on the Teams tab keeps the draw. The pool draw is fixed once the tournament starts.",
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-settings--pool-draw.webp',
					phoneSrc: '/assets/help/tournament-settings--pool-draw--phone.webp',
					alt: 'The three pool draws side by side',
				}, // Shot: the Pool draw panel with all three option cards, Seeded pots selected.
			},
			{
				id: 'matchups',
				heading: 'Matchups',
				paragraphs: [
					'Who plays whom, for a Round Robin division that limits games per team. By seed pairs each team with the teams seeded nearest to it; Random draws the opponents instead, and Reshuffle draws them again.',
					'Every team still plays the same number of games either way, and the seeding is unchanged, so it still breaks the last tie in the table. Adding, removing or reordering teams keeps the same draw.',
					"Changing it, or Reshuffle, rebuilds this division's fixtures and takes its matches off the schedule. It is fixed once the tournament starts.",
				],
			},
			{
				id: 'ranking',
				heading: 'Ranking',
				paragraphs: [
					'How teams are ordered in pool and league tables. It can be changed at any time, and standings re-sort straight away.',
					'Points gives each match a number of points by how it ended: a win in straight sets (2–0 in best of 3, 3–0 or 3–1 in best of 5), a win in the deciding set (2–1 or 3–2), a loss in the deciding set (1–2 or 2–3) and a loss in straight sets (0–2, 0–3 or 1–3). The presets fill in FIVB points (3, 2, 1, 0) or a simple 2 for any win and 1 for a deciding-set loss; the − and + buttons set any of them yourself, up to 10.',
					'Wins counts either match wins — the team with more matches won ranks higher — or set wins, where the team with more sets won ranks higher, whoever won the matches.',
				],
			},
			{
				id: 'deciders',
				heading: 'Tiebreak deciders',
				paragraphs: [
					'Applied in this order when teams are level on ranking. Seeding is always last, so every tie is settled.',
					'Set ratio is sets won ÷ sets lost, and point ratio is points won ÷ points lost. Head-to-head is the result between the level teams, and is skipped across pools. Set difference and point difference are won minus lost. Points scored is the total rally points won, and sets won the total sets won.',
				],
				steps: [
					{
						text: ['Drag a decider by its handle, or use its arrows, to change the order.'],
						media: {
							type: 'animation',
							src: '/assets/help/tournament-settings--deciders--1.webp',
							still: '/assets/help/tournament-settings--deciders--1--still.webp',
							phoneSrc: '/assets/help/tournament-settings--deciders--1--phone.webp',
							phoneStill: '/assets/help/tournament-settings--deciders--1--phone-still.webp',
							alt: 'Reordering tiebreak deciders',
						}, // Shot: dragging Head-to-head above Set ratio in the deciders list.
					},
					{
						text: ['The × stops using a decider, and “Add a decider” puts one back.'],
						media: {
							type: 'image',
							src: '/assets/help/tournament-settings--deciders--2.webp',
							phoneSrc: '/assets/help/tournament-settings--deciders--2--phone.webp',
							alt: 'Adding a decider back',
						}, // Shot: the deciders panel with one removed and its "+" chip under "Add a decider".
					},
				],
			},
			{
				id: 'placement',
				heading: 'Placement matches',
				paragraphs: [
					'Which knockout places are decided by a match, for a division with a knockout stage. “Play for places down to” adds real matches for the places below the final — a 3rd place match, a 5th, and so on — instead of settling them by tiebreak. The teams knocked out in each round play for the places between them, the same way the main bracket is drawn.',
					'Choosing 1st plays the final only, with no 3rd-place match. Changing this rebuilds the knockout fixtures, so it is fixed once the knockout stage has started.',
				],
			},
			{
				id: 'scoresheets',
				heading: 'Scoresheets',
				paragraphs: [
					"What prints when a fixture's scoresheet is downloaded. Choose a card to use it — the one in use has a border — and Clear selection to stop using any. With no template in use, fixtures show no scoresheet download.",
					'Two FIVB layouts, indoor and beach, are built in. Upload a PDF starts your own: you mark where each field prints on it. An uploaded template stays on the device it was uploaded from, so it only prints there; Edit fields moves its fields later.',
				],
			},
			{
				id: 'status',
				heading: 'Tournament status',
				paragraphs: [
					'Where the tournament is, and its next step. Not started: teams and divisions can still be changed. Ongoing: results are being entered, and teams and divisions are fixed. Finished: results can still be corrected.',
					'Start tournament closes team and division editing for good; the schedule can still be edited and results entered. End tournament marks it finished. Each asks you to confirm first.',
				],
			},
			{
				id: 'delete',
				heading: 'Delete tournament',
				paragraphs: [
					"Removes the whole tournament for good: every division, fixture and result. It cannot be undone, and is available at every status. You confirm by typing the tournament's name.",
				],
			},
		],
	},
	'tournament-fixtures-unscheduled': {
		title: 'Fixtures',
		icon: 'list',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"Every fixture across every division, in one list grouped by status (Live, Upcoming, Completed, Cancelled), ordered by match number. This tournament doesn't have a schedule yet — fixtures still run and results can still be entered without one; a schedule just adds courts and times.",
				],
			},
			{
				id: 'filtering-the-list',
				heading: 'Filtering the list',
				paragraphs: [
					'Filter by division, by stage (Preliminary Round for all pool and round-robin matches, then each knockout round in order, then Playoffs for the 3rd, 5th, 7th… place matches), by status, or search by team name. Each control only appears when it would actually narrow something down.',
				],
			},
			{
				id: 'entering-results',
				heading: 'Entering results',
				steps: [
					{
						text: [
							"Once the tournament has started, look for the score icon on a fixture's row. It appears on any fixture whose teams are known, for everyone allowed to score it.",
						],
						media: {
							type: 'image',
							src: '/assets/help/tournament-fixtures-unscheduled--entering-results--1.webp',
							phoneSrc: '/assets/help/tournament-fixtures-unscheduled--entering-results--1--phone.webp',
							alt: 'The score action on a fixture row',
						}, // Shot: a fixture row with its score action, on an ongoing tournament, as the organiser.
					},
					{
						text: ['It opens the score entry screen for that match — see its own help entry once it’s open.'],
						media: {
							type: 'image',
							src: '/assets/help/tournament-fixtures-unscheduled--entering-results--2.webp',
							phoneSrc: '/assets/help/tournament-fixtures-unscheduled--entering-results--2--phone.webp',
							alt: 'The score entry screen',
						}, // Shot: the score entry modal for a pool match with one set entered.
					},
				],
				paragraphs: [
					"A Scorer the organiser has added can do this for the current round's fixtures, and a Match Manager or Co-organiser for any fixture the organiser can.",
				],
			},
			{
				id: 'scheduling-and-exporting',
				heading: 'Scheduling and exporting',
				paragraphs: [
					"Create Schedule opens the schedule builder, where courts and times are assigned — see its own help entry once it's open.",
					'Results, with the download icon, is shown to the organiser and collaborators and opens a printable page of the completed fixtures in a new tab. It follows the filters set here, so filter first to export one division, stage or team.',
				],
			},
		],
	},
	'tournament-fixtures-scheduled': {
		title: 'Schedule',
		icon: 'calendar',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"This tournament has a schedule, so its fixtures are shown grouped by day, then by time, then by court — what's on, when, and where. The same division, stage, status and team filters as the unscheduled list are available here, plus day and court.",
					'Finished time slots fold away so the current part of the day stays in view; open one to see its results. Jump to now scrolls to the current time.',
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-fixtures-scheduled--intro.webp',
					phoneSrc: '/assets/help/tournament-fixtures-scheduled--intro--phone.webp',
					alt: 'The Schedule tab grouped by time',
				}, // Shot: the Schedule tab on a day in progress, with a folded run of finished slots and the next slots open.
			},
			{
				id: 'viewing-and-printing',
				heading: 'Viewing and printing',
				steps: [
					{
						text: ['The print icon opens a clean, printable version of the whole schedule in a new tab. Anyone can use it, not only the organiser.'],
						media: {
							type: 'image',
							src: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--1.webp',
							phoneSrc: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--1--phone.webp',
							alt: 'The print icon in the schedule toolbar',
						}, // Shot: the Schedule toolbar with the print icon's tooltip showing.
					},
					{
						text: ['Switch between the grid (courts across, times down) and the list (one row per fixture) with the two icons at the top, then press Print.'],
						media: {
							type: 'animation',
							src: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--2.webp',
							still: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--2--still.webp',
							phoneSrc: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--2--phone.webp',
							phoneStill: '/assets/help/tournament-fixtures-scheduled--viewing-and-printing--2--phone-still.webp',
							alt: 'Switching the printable schedule between grid and list',
						}, // Shot: the print page, pressing the list icon and then the grid icon.
					},
				],
			},
			{
				id: 'organiser',
				heading: 'If you run the tournament',
				paragraphs: [
					"Edit Schedule reopens the schedule builder — see its own help entry once it's open. Print All Scoresheets prints every fixture's scoresheet in one file, when a scoresheet template is in use.",
					'Results, with the download icon, opens a printable page of the completed fixtures in a new tab. It follows the filters set here, day and court included.',
				],
			},
		],
	},
	'tournament-standings-groups': {
		title: 'Pool / League standings',
		icon: 'structure',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"Teams in this pool or league, ranked by the division's ranking rules and tiebreak deciders (the organiser sets them on the Settings tab). If this division spans more than one round-robin round, the table combines all of them rather than showing a table per round.",
					'Turn on Advanced statistics for the full breakdown behind the ranking — set and point ratios, and a column for every scoreline this division has actually produced (for example, how many matches finished 2–1).',
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-standings-groups--intro.webp',
					phoneSrc: '/assets/help/tournament-standings-groups--intro--phone.webp',
					alt: 'A pool table with advanced statistics on',
				}, // Shot: a pool standings table with Advanced statistics switched on.
			},
			{
				id: 'switching-division-and-stage',
				heading: 'Switching division and stage',
				paragraphs: [
					"The selector above the table switches which division you're looking at, when the tournament has more than one. If this division also has a knockout stage or final rankings, the stage cards switch between Pool/League, Knockout and Final Rankings.",
				],
			},
			{
				id: 'organiser',
				heading: 'Starting the next round',
				steps: [
					{
						text: ['Once this round is complete, Start Next Round appears here.'],
						media: {
							type: 'image',
							src: '/assets/help/tournament-standings-groups--organiser--1.webp',
							phoneSrc: '/assets/help/tournament-standings-groups--organiser--1--phone.webp',
							alt: 'The next round panel beside a completed pool table',
						}, // Shot: a completed pool round with the Start Next Round button visible.
					},
					{
						text: [
							'It proposes who qualifies (or the order for another round-robin leg) and lets you reorder or swap a team before confirming. Nothing changes until you confirm.',
						],
						media: {
							type: 'image',
							src: '/assets/help/tournament-standings-groups--organiser--2.webp',
							phoneSrc: '/assets/help/tournament-standings-groups--organiser--2--phone.webp',
							alt: 'The next round screen',
						}, // Shot: the next round modal with its preview beside the list.
					},
				],
			},
		],
	},
	'tournament-standings-knockout': {
		title: 'Knockout bracket',
		icon: 'structure',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'The knockout bracket for this division. A match still waiting on an earlier result shows “Winner of…” until that result is in; once pool play has decided who fills the first knockout round, an unbound slot shows the pool position that earns it (for example “A1”) instead of a bare rank number.',
				],
				media: {
					type: 'image',
					src: '/assets/help/tournament-standings-knockout--intro.webp',
					phoneSrc: '/assets/help/tournament-standings-knockout--intro--phone.webp',
					alt: 'A knockout bracket part-way through',
				}, // Shot: a mid-tournament knockout bracket showing at least one round already decided (real team names) feeding into a round still showing "Winner of #N" placeholders, so the two states are both visible at once.
			},
			{
				id: 'organiser',
				heading: 'Starting the next round',
				paragraphs: [
					'Start Next Round appears here too once a knockout round is complete. It works the same way as it does for pool play, one round at a time, with the same reorder-before-confirming option.',
				],
			},
		],
	},
	'tournament-standings-rankings': {
		title: 'Final rankings',
		icon: 'progress',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'Where every team in this division finished. Places fill in from the bottom as knockout rounds are decided — a team eliminated in an earlier round already has its place before the final has been played — so this can show results before the tournament is finished.',
					'Final results, with the download icon, is shown to the organiser and collaborators and opens a printable final ranking of every division in a new tab.',
				],
			},
		],
	},
	'tournament-teams': {
		title: 'Teams',
		icon: 'teams',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'The teams in this division, in seed order — the order they were entered or last reordered in, which is also what pools and qualifying positions are drawn from.',
				],
			},
			{
				id: 'organiser',
				heading: 'Changing the teams before the start',
				paragraphs: ['Only before the tournament starts and before any result has been recorded.'],
				steps: [
					{
						text: [
							'Add Team adds one at a time. “Add multiple teams” takes a whole list at once — one name per line, or separated by commas.',
						],
						media: {
							type: 'animation',
							src: '/assets/help/tournament-teams--organiser--1.webp',
							still: '/assets/help/tournament-teams--organiser--1--still.webp',
							phoneSrc: '/assets/help/tournament-teams--organiser--1--phone.webp',
							phoneStill: '/assets/help/tournament-teams--organiser--1--phone-still.webp',
							alt: 'Adding several teams at once',
						}, // Shot: Add Team, switching to Add multiple teams, pasting four names and pressing Add teams.
					},
					{
						text: ['The pencil renames a team, and the bin removes it.'],
						media: {
							type: 'image',
							src: '/assets/help/tournament-teams--organiser--2.webp',
							phoneSrc: '/assets/help/tournament-teams--organiser--2--phone.webp',
							alt: 'A team row with its edit and remove icons',
						}, // Shot: a team row with the pencil's tooltip showing.
					},
					{
						text: [
							"This order is the seeding. Drag a team by its handle — or focus the handle and use the up and down arrow keys — to move it. Seeding decides how pools and knockout positions are drawn.",
						],
						media: {
							type: 'animation',
							src: '/assets/help/tournament-teams--organiser--3.webp',
							still: '/assets/help/tournament-teams--organiser--3--still.webp',
							phoneSrc: '/assets/help/tournament-teams--organiser--3--phone.webp',
							phoneStill: '/assets/help/tournament-teams--organiser--3--phone-still.webp',
							alt: 'Reordering teams by dragging',
						}, // Shot: dragging the fourth seed up to second place.
					},
					{
						text: [
							'Changes wait until you press Save Changes; Discard drops them. Adding, removing or reordering teams (not just renaming) regenerates the division’s fixtures, so you confirm the pool and qualifier setup again first.',
						],
						media: {
							type: 'image',
							src: '/assets/help/tournament-teams--organiser--4.webp',
							phoneSrc: '/assets/help/tournament-teams--organiser--4--phone.webp',
							alt: 'Unsaved team changes with Save Changes and Discard',
						}, // Shot: the unsaved-changes bar with Save Changes and Discard.
					},
				],
			},
			{
				id: 'pools-view',
				heading: 'Pools and the full list',
				paragraphs: [
					'For a Pool Play + Knockout division, Pools shows the teams in their pools and Full list shows the seeding. While a seeding change is unsaved, Pools keeps showing the saved pools; the change shows in the Full list until you save it.',
				],
			},
		],
	},
	about: {
		title: 'About Tourganiser',
		icon: 'info',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"Tourganiser is built for organising sports tournaments, with volleyball as the current focus and more sports planned. It's free to use, with no subscriptions, paywalls or ads.",
				],
			},
			{
				id: 'support-and-contact',
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
				id: 'intro',
				paragraphs: [
					"Tournaments you've created, tournaments you collaborate on, and tournaments you've saved to follow, each in their own paginated list. You'll need to be signed in to see this page.",
				],
			},
			{
				id: 'removing-a-saved-tournament',
				heading: 'Removing a saved tournament',
				paragraphs: [
					"Every card in Saved Tournaments has its own remove control to unfollow it — this only removes it from your list, it has no effect on the tournament itself. Managing or deleting one of your own tournaments happens inside the tournament.",
				],
			},
		],
	},
	// --- Modals ------------------------------------------------------------
	//
	// Each modal calls useHelpTopic with its id, and has a "?" in its header
	// that opens it. The page's topic reverts automatically the instant the
	// modal closes — see HelpContext.jsx.
	'division-modal': {
		title: 'Adding or editing a division',
		icon: 'structure',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					'A division has up to three screens: Basics, Configuration and Teams. Add Division (or Save Division, when editing) checks every screen, and a problem sends you back to the screen it belongs to.',
				],
			},
			{
				id: 'basics',
				heading: 'Basics',
				paragraphs: [
					'Name the division and choose how it will be played. Round Robin plays every team against every other team, ranked by a single table with no knockout stage. Pool Play + Knockout splits teams into pools that play among themselves, then sends the best through to a bracket.',
					'Switching format keeps the settings you entered for the other one, in case you switch back.',
				],
			},
			{
				id: 'configuration',
				heading: 'Configuration: Pool Play + Knockout',
				paragraphs: [
					'Teams are split evenly across the pools — shared out as evenly as the numbers allow. Once every pool has played, the best teams across the division go through to a knockout bracket.',
					'Teams advancing to the knockout is the total across the whole division, not the number from each pool.',
				],
			},
			{
				id: 'pool-draw',
				heading: 'Pool draw',
				paragraphs: [
					'How seeds are placed into the pools: Snake (the default), Straight, or Seeded pots. Each option shows pool A’s first seeds, so the difference is visible. You can change it in Settings until the tournament starts — see the Tournament settings help for how each draw works.',
				],
			},
			{
				id: 'configuration-league',
				heading: 'Configuration: Round Robin',
				paragraphs: [
					'Choose how many games each team plays. Every game counts toward one shared table.',
					'Play every team the same number of times: enter how many legs. One leg is a single round robin; each additional leg repeats it, so every team meets every other team again.',
					'Limit games per team: each team plays an exact number of games against different opponents. It has to be fewer than a full round robin, and — with an odd number of teams — an even number. A value that does not work out for the teams you end up with is explained rather than rounded.',
				],
			},
			{
				id: 'matchups',
				heading: 'Matchups',
				paragraphs: [
					'Only when games per team are limited, since not everyone meets everyone. By seed, each team plays the teams seeded nearest to it. Random draws the opponents instead.',
					'Random changes only who plays whom. Every team still plays exactly the same number of games, and the seeding stays as you set it — it still breaks the last tie in the table.',
					'The draw is kept with the division: adding, removing or reordering teams before the start pairs the new list the same way. To draw again, use Reshuffle in Tournament settings → Divisions.',
				],
			},
			{
				id: 'teams',
				heading: 'Teams',
				steps: [
					{
						text: ['Type a team name and press Enter (or Add) — the field stays ready for the next one.'],
						media: {
							type: 'animation',
							src: '/assets/help/division-modal--teams--1.webp',
							still: '/assets/help/division-modal--teams--1--still.webp',
							phoneSrc: '/assets/help/division-modal--teams--1--phone.webp',
							phoneStill: '/assets/help/division-modal--teams--1--phone-still.webp',
							alt: 'Adding teams one at a time',
						}, // Shot: typing three team names, pressing Enter after each.
					},
					{
						text: ['“Add multiple teams” takes a whole list at once: one name per line, or separated by commas.'],
						media: {
							type: 'image',
							src: '/assets/help/division-modal--teams--2.webp',
							phoneSrc: '/assets/help/division-modal--teams--2--phone.webp',
							alt: 'The bulk team box',
						}, // Shot: the Add multiple teams box with four names pasted in.
					},
					{
						text: [
							'The order is the seeding. Drag a team by its number, or focus it and use the arrow keys, to move it. The letter beside each team is the pool its seed lands in.',
						],
						media: {
							type: 'animation',
							src: '/assets/help/division-modal--teams--3.webp',
							still: '/assets/help/division-modal--teams--3--still.webp',
							phoneSrc: '/assets/help/division-modal--teams--3--phone.webp',
							phoneStill: '/assets/help/division-modal--teams--3--phone-still.webp',
							alt: 'Reordering teams in the division',
						}, // Shot: dragging a team by its number in a Pool Play division, the pool letters updating.
					},
					{
						text: [
							'With a Seeded pots draw, only the top seeds have a pool letter yet — the rest show a dash, and are drawn at random when the division is saved.',
						],
						media: {
							type: 'image',
							src: '/assets/help/division-modal--teams--4.webp',
							phoneSrc: '/assets/help/division-modal--teams--4--phone.webp',
							alt: 'Seeds drawn on save in a Seeded pots division',
						}, // Shot: the team list of a Seeded pots division, with dashes from the second pot onward.
					},
				],
			},
		],
	},
	'score-update-modal': {
		title: 'Entering a score',
		icon: 'edit',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"Enter each set's score for this fixture as it's played, or all at once afterwards. A set counts for whichever team scored more in it, and a tie counts for neither.",
				],
				steps: [
					{
						text: ['Type a score, or use the − and + buttons beside it.'],
						media: {
							type: 'animation',
							src: '/assets/help/score-update-modal--intro--1.webp',
							still: '/assets/help/score-update-modal--intro--1--still.webp',
							phoneSrc: '/assets/help/score-update-modal--intro--1--phone.webp',
							phoneStill: '/assets/help/score-update-modal--intro--1--phone-still.webp',
							alt: 'Entering a set score',
						}, // Shot: entering 25–20 for the first set, using + for one team.
					},
					{
						text: ['Add set adds another set. The bin removes a set entered by mistake.'],
						media: {
							type: 'image',
							src: '/assets/help/score-update-modal--intro--2.webp',
							phoneSrc: '/assets/help/score-update-modal--intro--2--phone.webp',
							alt: 'Adding and removing sets',
						}, // Shot: the score modal with three sets and the bin visible.
					},
					{
						text: ['Save score records what’s entered so far without finishing the match. End match finishes it from the sets entered.'],
						media: {
							type: 'image',
							src: '/assets/help/score-update-modal--intro--3.webp',
							phoneSrc: '/assets/help/score-update-modal--intro--3--phone.webp',
							alt: 'Save score and End match',
						}, // Shot: the score modal's footer with Save score and End match.
					},
				],
			},
			{
				id: 'cancelling',
				heading: 'Cancelling a match',
				paragraphs: [
					'Cancel match records the match as cancelled rather than played, which counts for neither team in the standings.',
					"A knockout match needs a winner, so End match stays unavailable while the sets are level. If one team can't play, record the walkover as a winning score for the team that goes through. If neither team can play, use Cancel match: neither team goes through, and the team due to meet the winner in the next round gets a walkover instead.",
				],
			},
			{
				id: 'correcting',
				heading: 'Correcting a result',
				paragraphs: [
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
				id: 'intro',
				paragraphs: [
					"This screen appears once a division's current round is complete and there's another round to move on to — either the qualifiers for a knockout stage, or every team carrying forward into another round-robin leg. Nothing here changes anything until you confirm.",
				],
			},
			{
				id: 'reviewing',
				heading: 'Reviewing and adjusting the order',
				steps: [
					{
						text: ["The list shows who's progressing, in the order calculated from the completed round's results."],
						media: {
							type: 'image',
							src: '/assets/help/next-round-modal--reviewing--1.webp',
							phoneSrc: '/assets/help/next-round-modal--reviewing--1--phone.webp',
							alt: 'The calculated qualifier order',
						}, // Shot: the next round modal as it opens, before any change.
					},
					{
						text: [
							'Use the arrows beside a team to reorder (or drag it by its handle), or the swap control to substitute a different eligible team. A change is recorded as a deliberate adjustment.',
						],
						media: {
							type: 'animation',
							src: '/assets/help/next-round-modal--reviewing--2.webp',
							still: '/assets/help/next-round-modal--reviewing--2--still.webp',
							phoneSrc: '/assets/help/next-round-modal--reviewing--2--phone.webp',
							phoneStill: '/assets/help/next-round-modal--reviewing--2--phone-still.webp',
							alt: 'Reordering and swapping qualifiers',
						}, // Shot: moving a team up one place, then opening the swap list and choosing another team.
					},
					{
						text: [
							'Beside the list (below it on a phone), the preview shows the matchups this order produces, live. A round-robin leg carries every team forward, so it has no bracket to preview.',
						],
						media: {
							type: 'image',
							src: '/assets/help/next-round-modal--reviewing--3.webp',
							phoneSrc: '/assets/help/next-round-modal--reviewing--3--phone.webp',
							alt: 'The matchup preview',
						}, // Shot: the preview panel beside a reordered list.
					},
				],
			},
			{
				id: 'confirming',
				heading: 'Confirming',
				paragraphs: [
					"Reset to calculated appears once you've changed anything, and puts the list back to the original order. Start next round confirms the current order and generates or binds the next round's fixtures — it is disabled while a team appears twice.",
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
				id: 'intro',
				paragraphs: [
					"Choose what prints when an organiser downloads a fixture's scoresheet. No template means fixtures show no scoresheet download at all.",
				],
			},
			{
				id: 'built-in-and-custom',
				heading: 'Built-in and custom templates',
				paragraphs: [
					'Two official FIVB layouts (indoor and beach) are built in and ready to use. Upload new template starts your own.',
					"A custom template lives only in this browser's storage, not on the server, so it is only usable on the device it was uploaded from. Other viewers see that it is selected but cannot download it.",
				],
			},
			{
				id: 'uploading',
				heading: 'Uploading your own',
				steps: [
					{
						text: ['Name the template and choose the PDF it is printed from.'],
						media: {
							type: 'image',
							src: '/assets/help/scoresheet-template-modal--uploading--1.webp',
							phoneSrc: '/assets/help/scoresheet-template-modal--uploading--1--phone.webp',
							alt: 'Uploading a PDF template',
						}, // Shot: the Upload a template screen with a name entered and a PDF chosen.
					},
					{
						text: ['On the next screen you draw a box for each piece of information to prefill — team names, date, court, division and more.'],
						media: {
							type: 'image',
							src: '/assets/help/scoresheet-template-modal--uploading--2.webp',
							phoneSrc: '/assets/help/scoresheet-template-modal--uploading--2--phone.webp',
							alt: 'The field placement screen',
						}, // Shot: the Place fields screen as it opens, with the PDF shown.
					},
				],
			},
			{
				id: 'placing-fields',
				heading: 'Placing fields',
				steps: [
					{
						text: ['Click-drag a box on the page for the selected field. A quick click without dragging drops a default-size box you can redraw.'],
						media: {
							type: 'animation',
							src: '/assets/help/scoresheet-template-modal--placing-fields--1.webp',
							still: '/assets/help/scoresheet-template-modal--placing-fields--1--still.webp',
							phoneSrc: '/assets/help/scoresheet-template-modal--placing-fields--1--phone.webp',
							phoneStill: '/assets/help/scoresheet-template-modal--placing-fields--1--phone-still.webp',
							alt: 'Drawing a field box on the PDF',
						}, // Shot: drawing a box for Team 1 on the PDF.
					},
					{
						text: [
							'A field can be placed more than once, and stays selected after each box, so another place for it is a straight-away drag. Open Fields to place a different one.',
						],
						media: {
							type: 'image',
							src: '/assets/help/scoresheet-template-modal--placing-fields--2.webp',
							phoneSrc: '/assets/help/scoresheet-template-modal--placing-fields--2--phone.webp',
							alt: 'The fields list',
						}, // Shot: the Fields panel open with some fields marked as placed.
					},
					{
						text: ['Text is sized and wrapped to fit each box when the scoresheet is generated. Save template when you are done.'],
						media: {
							type: 'image',
							src: '/assets/help/scoresheet-template-modal--placing-fields--3.webp',
							phoneSrc: '/assets/help/scoresheet-template-modal--placing-fields--3--phone.webp',
							alt: 'A placed template ready to save',
						}, // Shot: a page with several placed boxes and the Save template button.
					},
				],
			},
			{
				id: 'saving',
				heading: 'Saving',
				paragraphs: [
					'Select a template card and choose Save to make it this tournament\'s scoresheet template. Selecting "No template" and saving turns the scoresheet download off again. A custom template\'s row has its own edit control to reposition its fields later.',
				],
			},
		],
	},
	'schedule-maker-modal': {
		title: 'Building the schedule',
		icon: 'calendar',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"The organiser's tool for assigning fixtures to courts and times. The fixtures list is on the left and the board fills the rest, with the day tabs above it. Everything else opens when you need it: Set up, Auto-schedule and Print from the toolbar, and each match's own details when you click it. Nothing here is visible to anyone else until it's saved.",
				],
				media: {
					type: 'image',
					src: '/assets/help/schedule-maker-modal--intro.webp',
					phoneSrc: '/assets/help/schedule-maker-modal--intro--phone.webp',
					alt: 'The schedule maker on a multi-court day',
				}, // Shot: the full modal open on a multi-day, multi-court schedule with the board view active and a few fixtures already placed, wide enough to show the fixtures list, the day tabs and the board together.
			},
			{
				id: 'the-board',
				heading: 'The board',
				paragraphs: [
					"Switch between the board (courts across, times down) and a list (one row per placed match) with the two icons in the toolbar. Each day gets its own tab. A day that's off says so on its tab: nothing can be placed on it and it isn't auto-scheduled, but it stays in the schedule to switch back on.",
					'The grid lines are only a guide. A match can start at any five-minute mark, cross a line, or share an hour with another match.',
				],
				steps: [
					{
						text: ['Drag a fixture from the sidebar onto the board. It lands where you drop it, at its round’s length.'],
						media: {
							type: 'animation',
							src: '/assets/help/schedule-maker-modal--the-board--1.webp',
							still: '/assets/help/schedule-maker-modal--the-board--1--still.webp',
							alt: 'Dragging a fixture onto the board',
						}, // Shot: dragging an unscheduled fixture onto Court 1 at 10:00.
					},
					{
						text: [
							"Drag a placed match to move it, or drag its top or bottom edge to change its length. If it can't go there — a team is playing on another court, say — the reason appears beside your pointer and dropping changes nothing.",
						],
						media: {
							type: 'animation',
							src: '/assets/help/schedule-maker-modal--the-board--2.webp',
							still: '/assets/help/schedule-maker-modal--the-board--2--still.webp',
							alt: 'Moving and resizing a match',
						}, // Shot: moving a match to another court, then dragging its bottom edge longer.
					},
					{
						text: [
							"Click a match to edit its start, length, court, day, officials and notes where it sits. Remove from schedule takes it off the board and back to the sidebar.",
						],
						media: {
							type: 'image',
							src: '/assets/help/schedule-maker-modal--the-board--3.webp',
							phoneSrc: '/assets/help/schedule-maker-modal--the-board--3--phone.webp',
							alt: 'A match’s details',
						}, // Shot: a match's popover open on the board, Remove from schedule visible.
					},
					{
						text: ['Click or tap any empty time to choose a fixture for it, or drag down an empty court to choose the exact times first.'],
						media: {
							type: 'animation',
							src: '/assets/help/schedule-maker-modal--the-board--4.webp',
							still: '/assets/help/schedule-maker-modal--the-board--4--still.webp',
							phoneSrc: '/assets/help/schedule-maker-modal--the-board--4--phone.webp',
							phoneStill: '/assets/help/schedule-maker-modal--the-board--4--phone-still.webp',
							alt: 'Placing a fixture by choosing a time',
						}, // Shot: dragging down an empty court and picking a fixture from the list that opens.
					},
				],
			},
			{
				id: 'fixtures-sidebar',
				heading: 'Fixtures sidebar',
				paragraphs: [
					"Every fixture that isn't placed yet, searchable and filterable by round or division. On a narrow screen, tap a fixture here first, then tap the time it belongs at. If that time is taken, it goes to the next free time on that court.",
				],
			},
			{
				id: 'breaks',
				heading: 'Breaks',
				paragraphs: [
					'Drag Break from the top of the fixtures list onto the board, or tap it and then tap a time. A new break covers every court for 30 minutes. It opens straight away so you can name it, and you can limit it to one court or change its length there.',
				],
			},
			{
				id: 'set-up',
				heading: 'Set up',
				paragraphs: [
					"What you have to work with: the day's start and end, match lengths, your courts and which days are in use. Placing a fixture by hand and Auto-schedule both read from here. On a phone it's under More in the toolbar.",
					'The day’s hours apply to every day.',
					'Match length is what a new match starts at, whether you place it or Auto-schedule does. Give a round its own length under “By round” — blank uses the default — for example longer finals. Changing a length moves nothing already on the board; drag a match’s edge to change just that one.',
					"Each court can be limited to certain divisions; selecting nothing means the court takes any division. Clicking a court's heading on the board takes you straight to it.",
					'A day that is off stays in the tournament, but nothing can be scheduled on it.',
				],
			},
			{
				id: 'auto-schedule',
				heading: 'Auto-schedule',
				paragraphs: [
					'Auto-schedule fills the board using your set up. Breaks are kept; fixtures already on the board are replaced and placed again with everything else. It works through the day like you would on a whiteboard: at each time it plays the matches whose teams have the most still to play. Divisions sharing a court take turns whenever that finishes sooner. Your settings are saved with the schedule.',
					'Some rules always apply: rounds are played in order (no knockout match starts until every pool match of its division has finished), no team or court is double-booked, and courts limited to certain divisions are respected.',
					'Minimum rest is the gap a team gets between two of its own matches on the same day; off allows back-to-back matches. Matches per team per day caps how many one team plays on a single day. Longest wait is the most time a team should wait between two of its matches on the same day — teams near it play first, and any wait over it is reported.',
					"Break before knockout rounds is the time between the end of one round and the start of each knockout round. Knockout teams aren't known in advance, so minimum rest can't cover this. After a break in play, courts restart the moment the break ends.",
					'“Bend rules to fit every fixture” lets a fixture with nowhere else to go shorten rest or a knockout break, or exceed the daily limit, as few times as possible and spread across teams; every bend is listed afterwards in the Generation Report, and Show highlights those matches. “Run past the day’s end time” is the last resort: it adds time after the end of the final day, only as much as needed.',
					'Preferences decide the court, never whether a match plays: keeping a pool on one court, and keeping a court on one division. “Spread matches evenly across days” shares the matches between days; off finishes as early as possible, filling the first day first. Officials can also be assigned automatically — one team per match from the same division, never while it is playing; off keeps any officials already entered.',
				],
			},
			{
				id: 'saving-discarding-and-printing',
				heading: 'Saving, discarding and printing',
				paragraphs: [
					'Save Schedule writes the schedule to the tournament — nothing is visible to anyone else until this is pressed. Undo, or Ctrl+Z, takes back your last change, one at a time, until you save. Under More, Discard Changes reverts to what was last saved, and Reset Schedule empties the board, which only takes effect once you save afterwards.',
					'Print shows where the pages break, with grid and list icons to choose between, and you can move any break there. Print this layout opens the printable document in a new tab, using whatever is on the board, saved or not. Page breaks are saved with the rest of the schedule.',
				],
			},
		],
	},
	fallback: {
		title: 'Help',
		icon: 'info',
		sections: [
			{
				id: 'intro',
				paragraphs: [
					"There isn't anything specific to explain about this page yet. If you're not sure where to start, Discover (to browse tournaments) and Create (to start your own) are the two main things Tourganiser is for. Every topic is listed beside this one.",
				],
			},
		],
	},
};
