import { useEffect, useMemo, useRef, useState } from 'react';
import DivisionBadge from './DivisionBadge';
import SectionState from './SectionState';
import { isNotStarted } from './tournamentStatus';
import { viewerRole } from './collaboratorRoles';
import { canProgress, flattenFixtures } from './fixtureUtils';
import { dayTimeline, nextSlot, onCourtNow, slotsMissingResults } from './scheduleNow';
import { useScheduleClock } from './useScheduleClock';
import {
	CourtsBand,
	DivisionProgressBand,
	QueueBand,
	StatusLine,
	TimelineBand,
	ToScoreBand,
	UpNextBand,
} from './OverviewNow';
import { useTournamentTab } from './tournamentTabs';
import { getScheduleForTournament } from '../../utils/scheduleUtils';
import Icon from '../Icons';
import LoadingScreen from '../LoadingScreen';
import { useConfirm } from '../ConfirmContext';
import { useMessage } from '../../MessageContext';
import { useHelpTopic } from '../../HelpContext';
// Imported across from components/create/ deliberately, rather than moved
// somewhere shared. components/create/ now means "the division editor and its
// rules, wherever a division is being built" — which is what it always held;
// only its one caller made it look like a page folder. Moving two files to a
// third location to avoid the import would touch the creation page for no
// behavioural gain, and copying the modal would give the application two
// definitions of what a valid division is.
import DivisionModal from '../create/DivisionModal';
import { createEmptyDivision, poolDrawOf } from '../create/divisionFormats';
import {
	addDivision,
	deleteDivision,
	updateDivisionColour,
} from '../../requests';
import { useTournamentLifecycle } from './useTournamentLifecycle';
import { DIVISION_ACCENTS, divisionColorStyle, getAutomaticAccent } from '../../utils/divisionColors';

const RESOLVED = new Set(['COMPLETED', 'CANCELLED']);

// Court cards a spectator or scorer sees before "Show all".
const COURTS_BEFORE_MORE = 6;

// The scorer's court choice, remembered per tournament on this device. A
// convenience only: storage can be missing or refuse, and then the choice simply
// is not remembered.
const courtKey = (tournamentId) => `tourganiser:overview-court:${tournamentId}`;

function readStoredCourt(tournamentId) {
	try {
		return window.localStorage.getItem(courtKey(tournamentId)) ?? '';
	} catch {
		return '';
	}
}

function storeCourt(tournamentId, courtId) {
	try {
		if (courtId) window.localStorage.setItem(courtKey(tournamentId), courtId);
		else window.localStorage.removeItem(courtKey(tournamentId));
	} catch {
		// Not remembered; the choice still applies for this visit.
	}
}

// Which sections each role gets, in order. One Overview for everyone: a role
// changes what comes first, never what it may do — every action is still
// offered by its own capability flag and refused by the server.
//
// On a phone the sections stack in exactly this order. On a desktop the "main"
// sections fill the left column, the "side" ones a narrower right column, and
// the "full" ones run the full width underneath, each group in this order.
const ROLE_SECTIONS = {
	spectator: ['status', 'courts', 'upNext', 'divisionProgress', 'recent', 'about'],
	scorer: ['status', 'toScore', 'courts', 'upNext', 'divisionProgress', 'recent', 'about'],
	'match-manager': ['status', 'queue', 'timeline', 'courts', 'upNext', 'divisionProgress', 'recent', 'about'],
	'co-organiser': ['status', 'queue', 'divisions', 'courts', 'timeline', 'upNext', 'recent', 'about'],
	organiser: ['status', 'queue', 'divisions', 'courts', 'timeline', 'upNext', 'recent', 'about'],
};

const SECTION_AREA = {
	status: 'main',
	toScore: 'main',
	queue: 'main',
	courts: 'main',
	upNext: 'main',
	timeline: 'side',
	divisionProgress: 'side',
	// The side column, not the full width: a result line stretched across the
	// whole page puts the two team names too far apart to read as one match.
	recent: 'side',
	divisions: 'full',
	about: 'full',
};

// The tournament dashboard: what is happening now, what needs doing, and what
// this tournament is. Fixture lists, standings tables and team lists each have
// their own tab; this points into them rather than reproducing them.
export default function OverviewTab({
	tournament = {},
	dashboard = {},
	divisions: fullDivisions = [],
	can = {},
	onOpenDivision,
	onChanged,
	canScoreFixture,
	onScoreFixture,
	onProgressRound,
	onOpenSchedule,
	onPrintScoresheets,
	scoresheetTemplateSelected = false,
	scoresheetTemplateReady = false,
}) {
	useHelpTopic('tournament-overview');
	const { selectTab } = useTournamentTab();

	const divisions = dashboard.divisions ?? [];
	const role = viewerRole(can);
	const organising = role === 'match-manager' || role === 'co-organiser' || role === 'organiser';
	const status = tournament.status || 'Not Started';
	const live = status === 'Ongoing';

	// One clock read for every time-based section, so they agree about "now".
	const now = useScheduleClock();

	const [court, setCourt] = useState(() => readStoredCourt(tournament.id));
	const chooseCourt = (courtId) => {
		setCourt(courtId);
		storeCourt(tournament.id, courtId);
	};

	const schedule = useMemo(() => getScheduleForTournament(tournament), [tournament]);
	const fixtures = useMemo(() => flattenFixtures(fullDivisions), [fullDivisions]);

	const cards = onCourtNow(schedule, fixtures, now);
	const next = nextSlot(schedule, fixtures, now);
	const missing = organising || role === 'scorer' ? slotsMissingResults(schedule, fixtures, now) : [];
	const timeline = organising ? dayTimeline(schedule, fixtures, now) : [];

	// What each court plays next, for the organiser roles' court cards.
	const nextByCourt =
		organising && next ? new Map(next.matches.map(({ entry, fixture }) => [entry.courtId, fixture])) : null;

	const readyDivisions = organising
		? fullDivisions.filter(canProgress).map((division) => ({
				id: division.id,
				name: division.name,
				currentRoundName: divisions.find((entry) => entry.id === division.id)?.currentRoundName ?? null,
			}))
		: [];
	const scoresheetSlot = organising && can.printScoresheets && scoresheetTemplateSelected && next ? next : null;
	const queueCount = missing.length + readyDivisions.length + (scoresheetSlot ? 1 : 0);

	// The scorer's list: late results first, then what is on court, on the chosen
	// court. A stored court the schedule no longer has means all courts.
	const courtChoice = schedule.courts.some((entry) => entry.id === court) ? court : '';
	const toScore = [
		...missing.flatMap((slot) =>
			slot.matches.filter(({ fixture }) => slot.missing.includes(fixture)).map((match) => ({ ...match, late: true })),
		),
		...cards.filter(({ fixture }) => !RESOLVED.has(fixture.status)),
	]
		.filter(({ fixture }) => canScoreFixture?.(fixture))
		.filter(({ entry }) => !courtChoice || entry?.courtId === courtChoice)
		.filter(({ fixture }, index, list) => list.findIndex((item) => item.fixture.id === fixture.id) === index);

	const sections = {
		status: <StatusLine tournament={tournament} dashboard={dashboard} />,
		toScore: live && (
			<ToScoreBand
				items={toScore}
				schedule={schedule}
				divisions={fullDivisions}
				courts={schedule.courts}
				court={courtChoice}
				onCourtChange={chooseCourt}
				onScoreFixture={onScoreFixture}
			/>
		),
		// Before the start and after the end only when there is something in it:
		// an empty queue then says nothing useful.
		queue: (live || queueCount > 0) && (
			<QueueBand
				missing={missing}
				readyDivisions={readyDivisions}
				scoresheetSlot={scoresheetSlot}
				schedule={schedule}
				divisions={fullDivisions}
				canScoreFixture={canScoreFixture}
				onScoreFixture={onScoreFixture}
				canProgressRounds={can.progressRounds}
				onProgressRound={onProgressRound}
				scoresheetTemplateReady={scoresheetTemplateReady}
				onPrintScoresheets={onPrintScoresheets}
			/>
		),
		courts: live && (
			<CourtsBand
				cards={cards}
				schedule={schedule}
				divisions={fullDivisions}
				nextByCourt={nextByCourt}
				canScoreFixture={canScoreFixture}
				onScoreFixture={onScoreFixture}
				collapseAfter={organising ? null : COURTS_BEFORE_MORE}
			/>
		),
		upNext: status !== 'Finished' && (
			<UpNextBand
				slot={next}
				schedule={schedule}
				upcoming={dashboard.upcomingFixtures ?? []}
				divisions={fullDivisions}
				onOpenFixtures={() => selectTab('fixtures')}
			/>
		),
		timeline: status !== 'Finished' && timeline.length > 0 && (
			<TimelineBand
				rows={timeline}
				schedule={schedule}
				nowTime={now.time}
				played={dashboard.completedFixtureCount ?? 0}
				total={dashboard.totalFixtures ?? 0}
				canEditSchedule={can.editSchedule}
				onOpenSchedule={onOpenSchedule}
			/>
		),
		divisionProgress: <DivisionProgressBand divisions={divisions} onOpenDivision={onOpenDivision} />,
		divisions: (
			<DivisionsBand
				divisions={divisions}
				onOpenDivision={onOpenDivision}
				tournamentId={tournament.id}
				status={tournament.status}
				canManageSetup={can.manageSetup}
				onChanged={onChanged}
			/>
		),
		recent: <RecentBand dashboard={dashboard} divisions={divisions} />,
		about: (
			<TournamentInformation
				tournament={tournament}
				dashboard={dashboard}
				canManageSetup={can.manageSetup}
				onChanged={onChanged}
			/>
		),
	};

	const order = ROLE_SECTIONS[role];
	const area = (name) =>
		order
			.map((key, index) => ({ key, index }))
			.filter(({ key }) => SECTION_AREA[key] === name && sections[key])
			.map(({ key, index }) => (
				<div key={key} className={`tv-ov-item tv-ov-item--${key}`} style={{ order: index }}>
					{sections[key]}
				</div>
			));

	return (
		<div className={`tv-overview tv-ov tv-ov--${role}`}>
			<div className="tv-ov-main">{area('main')}</div>
			<div className="tv-ov-side">{area('side')}</div>
			<div className="tv-ov-full">{area('full')}</div>
		</div>
	);
}

// The only place the tournament's own metadata appears. The subheader carries
// the name and nothing else, so this band is where a reader finds out what they
// are looking at.
function TournamentInformation({ tournament, dashboard, canManageSetup, onChanged }) {
	// Both labels are pre-formatted by the backend ('1 August 2026'). Do not
	// reformat them here — the server owns date presentation.
	const start = tournament.start_date_label;
	const end = tournament.end_date_label;
	const dates = start && end ? `${start} — ${end}` : start || end || null;

	return (
		<section className="tv-band" aria-labelledby="tv-ov-about">
			<h2 id="tv-ov-about" className="tv-band-heading">
				About
			</h2>
			<div className="tv-info-card">
				{tournament.type && (
					<div className="tv-info-header">
						<span className="tv-info-format">{tournament.type}</span>
					</div>
				)}

				{tournament.description && <p className="tv-info-description">{tournament.description}</p>}

				<dl className="tv-info-grid">
					{tournament.location && <InfoItem label="Location" value={tournament.location} icon="location" />}
					{dates && <InfoItem label="Dates" value={dates} icon="calendar" />}
					<InfoItem label="Divisions" value={dashboard.divisionCount ?? 0} icon="structure" stat />
					<InfoItem label="Teams" value={dashboard.totalTeams ?? 0} icon="teams" stat />
				</dl>

				{canManageSetup && (
					<LifecycleActions tournamentId={tournament.id} status={tournament.status} onChanged={onChanged} />
				)}
			</div>
		</section>
	);
}

// Start and End, for whoever can manage setup. Absent entirely for anyone else,
// rather than shown disabled, and only the transition the tournament is in is
// offered: a finished tournament has neither. The questions and messages live in
// useTournamentLifecycle, shared with the Settings tab's Tournament status
// section, which also holds the scoresheet template and Delete.
function LifecycleActions({ tournamentId, status, onChanged }) {
	const { busy, start, end } = useTournamentLifecycle(tournamentId, onChanged);
	const current = status || 'Not Started';

	if (current !== 'Not Started' && current !== 'Ongoing') return null;

	return (
		<div className="tv-info-actions">
			{current === 'Not Started' && (
				<button type="button" className="tv-primary-action" disabled={busy} onClick={start}>
					Start Tournament
				</button>
			)}

			{current === 'Ongoing' && (
				<button type="button" className="tv-primary-action" disabled={busy} onClick={end}>
					End Tournament
				</button>
			)}
		</div>
	);
}

function InfoItem({ label, value, icon = null, stat = false }) {
	return (
		<div className={`tv-info-item ${stat ? 'tv-info-item--stat' : ''}`.trim()}>
			<dt>
				{icon && <Icon name={icon} className="tv-info-item-icon" size={16} />}
				{label}
			</dt>
			<dd>{value}</dd>
		</div>
	);
}

// One card per division, summarising it and offering a way into the tab that
// holds the detail. No fixture lists and no standings — a card says how big a
// division is and how far through it is, and nothing more.
function DivisionsBand({ divisions: stored, onOpenDivision, tournamentId, status, canManageSetup, onChanged }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState(false);
	// Colours chosen in this band and not yet confirmed by a refetch, keyed by
	// division id. A colour change is one request and then a fresh fetch of the
	// whole tournament, so without this the swatch the organiser just clicked
	// would sit unchanged for the round trip and read as a click that did nothing.
	//
	// Each override records the stored colour it was applied over. That is what
	// retires it: once the fetch comes back with anything other than that base,
	// the server has had its say and the override is ignored — so a value the
	// server settled on differently is never masked by what was clicked. Applied
	// to the whole list rather than to one card, because an accent is resolved
	// against the division's siblings and the list is what that reads.
	const [pendingColours, setPendingColours] = useState({});

	const divisions = stored.map((division) => {
		const pending = pendingColours[division.id];
		const superseded = !pending || (division.color ?? null) !== pending.base;

		return superseded ? division : { ...division, color: pending.colour };
	});

	// A division can only be added or removed before the tournament starts —
	// afterwards the schedule and the standings are describing a fixed set of
	// them. Absent entirely for a viewer, and absent once started, rather than
	// shown and then refused with a 409.
	const canCompose = canManageSetup && isNotStarted(status);

	const run = async (action, successMessage) => {
		setBusy(true);
		try {
			await action();
			showMessage(successMessage, 'success');
			onChanged?.();
		} catch (apiError) {
			// Display-ready by contract, including both 409s — a started
			// tournament and the tournament's last division.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	// The modal hands back its own draft, which carries a local id and no
	// num_teams. The endpoint reads the same shape the creation page sends, so
	// the payload is built exactly the way CreateTournament.jsx's buildPayload
	// builds it — Classic's pool/qualifier settings, or League's round-robin
	// mode, each included only for the format that has them — and the local id
	// dropped. Keep the two in sync; this one previously fell behind when
	// League's round-robin config was added and only buildPayload was updated,
	// which silently generated a single leg here regardless of what was
	// entered.
	const handleAdd = async (draft) => {
		setAdding(false);

		await run(
			() =>
				addDivision(tournamentId, {
					name: draft.name,
					type: draft.type,
					num_teams: draft.teams.length,
					...(draft.type === 'classic' && {
						num_groups: Number(draft.num_groups),
						knockout_teams: Number(draft.knockout_teams),
						pool_draw: poolDrawOf(draft.pool_draw),
					}),
					...(draft.type === 'league' && {
						round_robin_mode: draft.roundRobinMode,
						...(draft.roundRobinMode === 'limited'
							? { games_per_team: Number(draft.gamesPerTeam) }
							: { round_robin_legs: Number(draft.roundRobinLegs) }),
					}),
					teams: draft.teams.map((team) => ({ name: team.name })),
				}),
			'Division added.',
		);
	};

	// Named in counts rather than adjectives, because the counts are what the
	// organiser is about to lose. The scheduled slots are not counted: the card
	// carries how many fixtures a division has, not how many of them are placed.
	//
	// The last-division rule is not checked here. The server owns it, and the
	// client shows its refusal.
	const handleRemove = async (division) => {
		const confirmed = await confirm(
			`Its ${division.teamCount ?? 0} teams, ${
				division.fixtureCount ?? 0
			} fixtures and any scheduled slots are removed too. This cannot be undone.`,
			{ title: `Remove ${division.name}?`, confirmLabel: 'Remove division', cancelLabel: 'Keep it', danger: true },
		);
		if (!confirmed) return;

		await run(() => deleteDivision(division.id), 'Division removed.');
	};

	// Deliberately not routed through `run`. That helper raises the full-screen
	// loader, which is right for a request that regenerates fixtures and wrong
	// for one that changes a colour — and there is no success toast either,
	// because the card changing colour is the confirmation. Only a failure has
	// anything to say, and it also drops the override so the card stops showing
	// a colour that was not saved.
	const handleColour = async (division, colour) => {
		const base = stored.find((entry) => entry.id === division.id)?.color ?? null;
		setPendingColours((current) => ({ ...current, [division.id]: { colour, base } }));

		try {
			await updateDivisionColour(division.id, colour);
			onChanged?.();
		} catch (apiError) {
			setPendingColours((current) => {
				const remaining = { ...current };
				delete remaining[division.id];

				return remaining;
			});
			// Display-ready by contract.
			showMessage(apiError.message, 'error');
		}
	};

	return (
		<section className="tv-band">
			<div className="tv-band-header">
				<h2 className="tv-band-heading">Divisions</h2>

				{canCompose && (
					<button
						type="button"
						className="tv-primary-action"
						disabled={busy}
						onClick={() => setAdding(true)}>
						Add Division
					</button>
				)}
			</div>

			{divisions.length === 0 ? (
				<SectionState
					variant="empty"
					title="This tournament has no divisions"
					message="Divisions are added when the tournament is created."
				/>
			) : (
				<div className="tv-division-cards">
					{divisions.map((division) => (
						<DivisionCard
							key={division.id}
							division={division}
							divisions={divisions}
							onOpenDivision={onOpenDivision}
							canRemove={canCompose}
							busy={busy}
							onRemove={handleRemove}
							// Not canCompose: adding and removing divisions stop
							// when the tournament starts because the schedule and
							// the standings then describe a fixed set of them. A
							// colour describes nothing, so the organiser keeps it
							// for the tournament's whole life.
							canRecolour={canManageSetup}
							onRecolour={handleColour}
						/>
					))}
				</div>
			)}

			{/* Both requests generate or delete fixtures server-side and take long
			    enough to look like nothing happened. The modal has already closed
			    and the confirmation is already dismissed by this point, so without
			    this the page is idle and unchanged until the toast arrives. The
			    same full-screen loader the rest of the app uses, which also blocks
			    a second click while the first is in flight. */}
			{busy && <LoadingScreen context="divisionSave" />}

			{/* No key: unlike the creation page, which reuses one modal across
			    several divisions, this only ever opens a fresh empty one. */}
			{adding && (
				<DivisionModal
					division={createEmptyDivision()}
					isEditing={false}
					onCancel={() => setAdding(false)}
					onSave={handleAdd}
				/>
			)}
		</section>
	);
}

function DivisionCard({
	division,
	divisions = [],
	onOpenDivision,
	canRemove = false,
	busy = false,
	onRemove,
	canRecolour = false,
	onRecolour,
}) {
	const total = division.fixtureCount ?? 0;
	const completed = division.completedFixtureCount ?? 0;
	// Guarded: a division with no fixtures yet would otherwise divide by zero.
	const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<article className="tv-division-card" style={divisionColorStyle(division.id, divisions)}>
			{/* A div, not a <header>. App.css styles the bare `header` element for
			    the site's fixed top bar — position: fixed, width: 100vw, height:
			    80px — so any <header> anywhere in the app is torn out of its
			    container. Avoid the bare landmark elements in this page entirely. */}
			<div className="tv-division-card-header">
				<h3>{division.name}</h3>
				{division.type && <span className="tv-info-format">{division.type}</span>}

				{canRecolour && (
					<DivisionColourPicker
						division={division}
						divisions={divisions}
						onChoose={(colour) => onRecolour(division, colour)}
					/>
				)}
			</div>

			<dl className="tv-division-card-stats">
				<InfoItem label="Teams" value={division.teamCount ?? 0} />
				<InfoItem label="Fixtures" value={total} />
				{division.currentRoundName && <InfoItem label="Round" value={division.currentRoundName} />}
			</dl>

			<div className="tv-progress">
				<div className="tv-progress-bar">
					<span className="tv-progress-fill" style={{ width: `${percent}%` }} />
				</div>
				<span className="tv-progress-label">
					{completed} of {total} played
				</span>
			</div>

			<div className="tv-division-card-actions">
				<button type="button" onClick={() => onOpenDivision(division.id, 'standings')}>
					Standings
				</button>
				<button type="button" onClick={() => onOpenDivision(division.id, 'teams')}>
					Teams
				</button>

				{/* Red and iconographic, so it reads as destructive at a glance and
				    is not mistaken for a third way into the division. Sized to the
				    icon rather than sharing the row evenly with Standings and
				    Teams, which are the actions this card is actually for.
				    The name is in the label because the icon alone does not say
				    which division it belongs to. */}
				{canRemove && (
					<button
						type="button"
						className="tv-division-card-remove"
						disabled={busy}
						title={`Remove ${division.name}`}
						aria-label={`Remove ${division.name}`}
						onClick={() => onRemove(division)}>
						<Icon name="delete" size={18} />
					</button>
				)}
			</div>
		</article>
	);
}

// The organiser's control over a division's colour: the current swatch, which
// opens a small palette.
//
// On the card rather than in a settings screen because the card is where the
// colour is already on show — the thing being changed and the control that
// changes it are the same object. Organiser only, and shown for the tournament's
// whole life; see the note on canRecolour at the call site.
//
// The palette itself comes from divisionColors.js rather than being listed here,
// so the swatches offered are exactly the tokens a division can resolve to.
function DivisionColourPicker({ division, divisions, onChoose }) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef(null);

	// Same dismissal the schedule maker's overflow menu uses: pointerdown
	// outside closes, so a click on the card behind does not leave the palette
	// hanging over it.
	useEffect(() => {
		if (!open) return;

		const onPointerDown = (event) => {
			if (!containerRef.current?.contains(event.target)) setOpen(false);
		};
		const onKeyDown = (event) => {
			if (event.key === 'Escape') setOpen(false);
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	const chosen = division.color ?? null;
	// What "Default" would give this division, shown as the colour it actually
	// resolves to rather than as an empty swatch — the option is a colour like
	// any other, it just is not a stored choice.
	const automatic = getAutomaticAccent(division.id, divisions);

	// Which accents this division's siblings are already showing, so a duplicate
	// can be marked. Not forbidden: two divisions in one colour is the
	// organiser's call, and refusing it would be the application overruling a
	// deliberate choice.
	const taken = new Set(
		divisions
			.filter((entry) => entry.id !== division.id)
			.map((entry) => entry.color ?? getAutomaticAccent(entry.id, divisions)?.replace('--', '')),
	);

	const choose = (colour) => {
		setOpen(false);
		if (colour !== chosen) onChoose(colour);
	};

	return (
		<div className="tv-division-colour" ref={containerRef}>
			<button
				type="button"
				className="tv-division-colour-toggle"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label={`Change the colour of ${division.name}`}
				title="Change colour"
				onClick={() => setOpen((value) => !value)}>
				<span className="tv-division-colour-swatch" aria-hidden="true" />
			</button>

			{open && (
				<div className="tv-division-colour-menu" role="menu" aria-label={`${division.name} colour`}>
					<button
						type="button"
						role="menuitemradio"
						aria-checked={chosen === null}
						className={`tv-division-colour-option is-default ${chosen === null ? 'is-current' : ''}`}
						style={automatic ? { '--tv-division-color': `var(${automatic})` } : undefined}
						onClick={() => choose(null)}>
						Default
					</button>

					<div className="tv-division-colour-swatches">
						{DIVISION_ACCENTS.map((accent) => (
							<button
								key={accent}
								type="button"
								role="menuitemradio"
								aria-checked={chosen === accent}
								className={`tv-division-colour-option ${chosen === accent ? 'is-current' : ''} ${
									taken.has(accent) ? 'is-taken' : ''
								}`}
								style={{ '--tv-division-color': `var(--${accent})` }}
								// The name is the only thing a screen reader has to
								// go on here — a swatch has no text — and "in use by
								// another division" is the whole of what the marker
								// on it means.
								aria-label={`${accent.replace('accent-', 'Colour ')}${
									taken.has(accent) ? ', in use by another division' : ''
								}`}
								onClick={() => choose(accent)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Already sorted and capped at eight by the backend. Rendering it as given is
// the point: re-sorting or re-slicing here would put a second, competing
// definition of "recent" in the client. "Up next" moved to UpNextBand
// (OverviewNow.jsx), which reads the schedule.
function RecentBand({ dashboard, divisions = [] }) {
	return (
		<section className="tv-band">
			<FixturePreviewList
				title="Recent results"
				fixtures={dashboard.recentResults ?? []}
				emptyMessage="No matches have finished yet."
				divisions={divisions}
			/>
		</section>
	);
}

function FixturePreviewList({ title, fixtures, emptyMessage, divisions = [] }) {
	return (
		<div className="tv-activity-column">
			<h2 className="tv-band-heading">{title}</h2>

			{fixtures.length === 0 ? (
				<p className="tv-activity-empty">{emptyMessage}</p>
			) : (
				<ul className="tv-fixture-previews">
					{fixtures.map((fixture) => (
						<FixturePreview key={fixture.id} fixture={fixture} divisions={divisions} />
					))}
				</ul>
			)}
		</div>
	);
}

function FixturePreview({ fixture, divisions = [] }) {
	// A cancelled match's stored 0-0 is a convention, not a score: show the status.
	const score = fixture.status === 'CANCELLED' ? null : formatResult(fixture.result);

	return (
		<li className="tv-fixture-preview">
			<div className="tv-fixture-preview-meta">
				{fixture.match_no != null && <span className="tv-match-no">#{fixture.match_no}</span>}
				<DivisionBadge id={fixture.division_id} name={fixture.division_name} divisions={divisions} />
			</div>

			<div className="tv-fixture-preview-teams">
				<span>{fixture.team1}</span>
				<span className="tv-versus">v</span>
				<span>{fixture.team2}</span>
			</div>

			{/* A result where there is one, the status where there is not. Both are
			    server-supplied; statusLabel is the display form of the enum. */}
			<span className={`tv-fixture-preview-outcome ${score ? '' : 'tv-fixture-preview-outcome--status'}`}>
				{score || fixture.statusLabel}
			</span>
		</li>
	);
}

// result is [[teamOneScore, teamTwoScore], ...], one pair per set.
function formatResult(result) {
	if (!Array.isArray(result) || result.length === 0) return null;

	return result.map(([one, two]) => `${one}-${two}`).join(', ');
}
