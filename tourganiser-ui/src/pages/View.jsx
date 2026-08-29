import { useNavigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useContext, useEffect, useMemo, useState } from 'react';
import { fetchTournamentData } from '../requests';
import { AuthContext } from '../AuthContext';
import '../App.css';
import TournamentShell from '../components/tournament/TournamentShell';
import { useTournamentTab } from '../components/tournament/tournamentTabs';
import SectionState from '../components/tournament/SectionState';
import OverviewTab from '../components/tournament/OverviewTab';
import FixturesTab from '../components/tournament/FixturesTab';
import ScheduleTab from '../components/tournament/ScheduleTab';
import StandingsTab from '../components/tournament/StandingsTab';
import TeamsTab from '../components/tournament/TeamsTab';
import RoundCompleteBanner from '../components/tournament/RoundCompleteBanner';
import LoadingScreen from '../components/LoadingScreen';
import Icon from '../components/Icons';
import ScoreUpdateModal from '../components/ScoreUpdateModal';
import NextRoundModal from '../components/NextRoundModal';
import { flattenFixtures } from '../components/tournament/fixtureUtils';
import { useMessage } from '../MessageContext';
import { updateFixtureResult, updateTournamentSchedule } from '../requests';
import { getScheduleForTournament, getCourtName } from '../utils/scheduleUtils';

// Dynamically imported rather than statically: it pulls in pdf-lib, which
// only the scoresheet feature needs, and every viewer of every tournament
// page would otherwise pay for it whether or not a template is selected.
const loadScoresheetPrefill = () => import('../utils/scoresheetPrefill');

// Split out of the main bundle. It is a large screen — a grid, a list, an
// inspector, a generator and two print layouts — that only an organiser opens,
// and only deliberately. It used to also drag in jsPDF and html2canvas; printing
// through the browser removed that, so the chunk is much smaller than it was,
// but the component is still worth deferring.
const ScheduleMakerModal = lazy(() => import('../components/ScheduleMakerModal'));

export default function ViewPage() {
	const { id } = useParams();
	const { activeTab, selectTab } = useTournamentTab();
	const { showMessage } = useMessage();
	const navigate = useNavigate();

	// Which division Standings and Teams are showing. Page state rather than URL
	// state: step 3 dropped ?division=, and a division is a choice within a
	// section, not a place. It lives here rather than inside those sections
	// because an Overview card has to be able to set it on the way in.
	//
	// null means "not chosen yet"; the sections fall back to the first division.
	const [selectedDivisionId, setSelectedDivisionId] = useState(null);

	// Retry bumps this, which changes the request key and re-runs the effect.
	const [attempt, setAttempt] = useState(0);

	// data.creator is resolved server-side from the session cookie, so logging
	// in or out has to refetch for the organiser controls to be right. The
	// version only moves on a real session change — keying on isLoggedIn would
	// fetch twice on every load, since it is false until the mount check
	// resolves. See AuthProvider.
	const { sessionVersion } = useContext(AuthContext);
	const requestKey = `${id}:${attempt}:${sessionVersion}`;

	// The result is tagged with the request it answered. Loading is then derived
	// rather than stored, which keeps every setState out of the effect body and
	// means switching tournaments shows the skeleton immediately instead of the
	// previous tournament's data.
	const [result, setResult] = useState({ key: null, data: null, error: null });

	// One request feeds the whole page — see the handover, decision A1. It is not
	// split per section, so a failure is one error in the content area rather than
	// four. The navigation stays usable either way.
	useEffect(() => {
		let active = true;

		const load = async () => {
			try {
				// The session is part of the cache key as well as the request
				// key: the payload's `creator` depends on who is asking, so a
				// cached copy must never outlive the session it was fetched for.
				const response = await fetchTournamentData(id, sessionVersion);

				if (active) setResult({ key: requestKey, data: response.data, error: null });
			} catch (apiError) {
				// Display-ready by contract, including "Tournament not found".
				if (active) setResult({ key: requestKey, data: null, error: apiError.message });
			}
		};

		load();

		// A slower first request must not overwrite a newer one's result.
		return () => {
			active = false;
		};
		// sessionVersion is already inside requestKey, so listing it adds no
		// extra runs — it is here because the effect now reads it directly.
	}, [id, requestKey, sessionVersion]);

	const loading = result.key !== requestKey;

	// Null while loading, which is what draws the skeleton. A failed load falls
	// back to a generic title rather than leaving the skeleton shimmering over an
	// error that is never going to resolve into a name.
	const title = result.data?.tournament?.name ?? (loading ? null : 'Tournament');

	// An Overview card sets both at once: which section to show, and which
	// division that section should be showing.
	const handleOpenDivision = (divisionId, tab) => {
		setSelectedDivisionId(divisionId);
		selectTab(tab);
	};

	// Re-runs the one request that feeds the page. Every mutation on this page
	// goes through it, because nothing here holds its own copy of the data — a
	// change is only visible once the request that produced it runs again.
	const reload = () => setAttempt((count) => count + 1);

	// A deleted tournament has no page left to reload, so this leaves rather than
	// refetching into a 404. replace, so Back does not return to the dead route.
	const handleDeleted = () => navigate('/tournaments', { replace: true });

	// Score entry. The id is held rather than the fixture itself, so that after a
	// reload the modal is handed the refetched row instead of the stale copy it
	// was opened with — the page holds no other copy of the data.
	const [scoringFixtureId, setScoringFixtureId] = useState(null);

	const scoringFixture = scoringFixtureId
		? flattenFixtures(result.data?.divisions ?? []).find((fixture) => fixture.id === scoringFixtureId)
		: null;

	// Both of the modal's buttons are the same call; only the intent differs.
	// The server derives the status from that and the scores.
	const saveResult = async (sets, finished) => {
		try {
			// The modal keeps sets as [{ team1, team2 }]; the endpoint takes pairs.
			await updateFixtureResult(
				scoringFixtureId,
				sets.map((set) => [set.team1, set.team2]),
				finished,
			);

			// Standings, the bracket and the round counts are all derived from the
			// fixtures server-side, so one refetch updates every one of them.
			reload();
			return true;
		} catch (apiError) {
			// Display-ready by contract. The modal stays mounted and keeps its own
			// state, so the scores that were rejected are still on screen.
			showMessage(apiError.message, 'error');
			return false;
		}
	};

	// Save keeps the modal open — a live match is scored set by set. Ending it
	// closes, because there is nothing left to enter.
	const handleSaveScore = async (sets) => {
		if (await saveResult(sets, false)) showMessage('Score saved.', 'success');
	};

	const handleEndMatch = async (sets) => {
		if (await saveResult(sets, true)) {
			showMessage('Match ended.', 'success');
			setScoringFixtureId(null);
		}
	};

	const handleCancelMatch = async () => {
		// Mirrors the existing CANCELLED derivation in fixtures.service.js's
		// deriveStatus: finished === true with exactly one set at 0-0. This is
		// the one place that convention should be encoded on the client — the
		// modal itself no longer knows about it.
		if (await saveResult([{ team1: 0, team2: 0 }], true)) {
			showMessage('Match cancelled.', 'success');
			setScoringFixtureId(null);
		}
	};

	// Offered only where a result can actually be recorded, which is three
	// conditions rather than one.
	//
	// A knockout fixture still showing "Rank 1" has no teams bound, and the
	// server rejects it with a 400 — better not to offer the action than to
	// explain the refusal. And a tournament nobody has started cannot have a
	// result, so the control before kick-off is a lie about what it will do.
	//
	// A Finished tournament keeps the action, deliberately. The server accepts a
	// result whatever the status, and a score entered wrongly would otherwise
	// have no route to being corrected once the tournament was ended — which is
	// exactly when somebody notices.
	//
	// fixture.locked is the server's own answer to whether this fixture's round
	// has already been progressed past — see roundHolding in
	// tournamentViewFormatter.js — so a pool game freezes the moment the
	// quarterfinals start, while the round it belongs to is still ongoing it
	// stays editable.
	const renderScoreAction = (fixture) => {
		if (!fixture.team_1_id || !fixture.team_2_id) return null;
		if ((result.data?.tournament?.status ?? 'Not Started') === 'Not Started') return null;
		if (fixture.locked) return null;

		// An icon on the row, where the word would be the widest thing in its
		// column. aria-label rather than title alone, so the control is named for a
		// screen reader as well as for a pointer; the label below is the same text
		// shown when the row has the width for it.
		const label = fixture.result?.length > 0 ? 'Edit Score' : 'Enter Score';

		return (
			<button
				type="button"
				className="tv-row-action"
				title={label}
				aria-label={label}
				onClick={() => setScoringFixtureId(fixture.id)}>
				<Icon name="edit" size={20} />
				<span className="tv-row-action-label">{label}</span>
			</button>
		);
	};

	// Scoresheets. The template is resolved once per selection rather than on
	// every click, so the fixture and toolbar buttons can show the
	// device-bound-miss state up front instead of erroring on click — see
	// docs/handover-scoresheets.md, Step 7's Don't.
	const scoresheetTemplateKey = result.data?.tournament?.scoresheet_template ?? null;
	const [resolvedScoresheetTemplate, setResolvedScoresheetTemplate] = useState(null);

	useEffect(() => {
		let active = true;

		(async () => {
			const template = scoresheetTemplateKey
				? await loadScoresheetPrefill().then(({ resolveTemplate }) => resolveTemplate(scoresheetTemplateKey))
				: null;

			if (active) setResolvedScoresheetTemplate(template);
		})();

		return () => {
			active = false;
		};
	}, [scoresheetTemplateKey]);

	// Day, start time and court name per fixture, resolved once from the same
	// schedule ScheduleTab already reads — not re-derived per fixture.
	const scoresheetScheduleIndex = useMemo(() => {
		const schedule = getScheduleForTournament(result.data?.tournament ?? {});
		const index = new Map();

		schedule.entries.forEach((entry) => {
			if (entry.type !== 'fixture' || !entry.fixtureId) return;

			index.set(entry.fixtureId, {
				day: entry.day,
				startTime: entry.startTime,
				courtName: getCourtName(schedule, entry.courtId),
			});
		});

		return index;
	}, [result.data?.tournament]);

	const openGeneratedPdf = (bytes) => {
		const blob = new Blob([bytes], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		window.open(url, '_blank', 'noopener');
		// The new tab needs time to load the blob before the URL is safe to
		// revoke; there is no load event to hook from here, so a generous
		// delay stands in for one.
		setTimeout(() => URL.revokeObjectURL(url), 60000);
	};

	const handleDownloadScoresheet = async (fixture) => {
		if (!resolvedScoresheetTemplate) return;

		try {
			const { buildFieldValues, generateScoresheet } = await loadScoresheetPrefill();
			const fieldValues = buildFieldValues(
				fixture,
				result.data.tournament,
				null,
				scoresheetScheduleIndex.get(fixture.id),
			);
			openGeneratedPdf(await generateScoresheet(resolvedScoresheetTemplate, fieldValues));
		} catch {
			showMessage('The scoresheet could not be generated.', 'error');
		}
	};

	// Present whenever the fixture can plausibly get one, gated the same two
	// ways as the toolbar's "Print all": selected at all, and resolvable on
	// this device. Absent rather than shown-and-erroring for anything else.
	const renderScoresheetAction = (fixture) => {
		if (!scoresheetTemplateKey) return null;

		return (
			<button
				type="button"
				className="tv-row-action"
				title={resolvedScoresheetTemplate ? 'Download scoresheet' : 'Scoresheet template not available on this device'}
				aria-label="Download scoresheet"
				disabled={!resolvedScoresheetTemplate}
				onClick={() => handleDownloadScoresheet(fixture)}>
				<Icon name="download" size={20} />
				<span className="tv-row-action-label">Scoresheet</span>
			</button>
		);
	};

	const handlePrintAllScoresheets = async () => {
		if (!resolvedScoresheetTemplate) return;

		try {
			const { buildFieldValues, generateScoresheet, mergeScoresheets } = await loadScoresheetPrefill();
			const fixtures = flattenFixtures(result.data?.divisions ?? []);
			const pdfBytesList = [];

			for (const fixture of fixtures) {
				const fieldValues = buildFieldValues(
					fixture,
					result.data.tournament,
					null,
					scoresheetScheduleIndex.get(fixture.id),
				);
				// Sequential: each fixture's PDF is generated from the same shared
				// template document, and there is nothing to gain from racing them.
				pdfBytesList.push(await generateScoresheet(resolvedScoresheetTemplate, fieldValues));
			}

			openGeneratedPdf(await mergeScoresheets(pdfBytesList));
		} catch {
			showMessage('The scoresheets could not be generated.', 'error');
		}
	};

	// The row's one action slot, shared by score entry and the scoresheet
	// download — each independently absent per its own rule above.
	const renderFixtureAction = (fixture) => {
		const scoreAction = renderScoreAction(fixture);
		const scoresheetAction = renderScoresheetAction(fixture);

		if (!scoreAction && !scoresheetAction) return null;

		return (
			<>
				{scoreAction}
				{scoresheetAction}
			</>
		);
	};

	// Round progression, opened from Standings for one division. The modal fetches
	// its own proposal and posts its own confirmation, so the page holds only
	// which division is being advanced.
	const [progressingDivisionId, setProgressingDivisionId] = useState(null);

	const handleRoundProgressed = () => {
		// Knockout fixtures have just been bound to real teams, so the bracket,
		// the standings and the fixture list all change together.
		reload();
		setProgressingDivisionId(null);
		showMessage('Next round started.', 'success');
	};

	// Create Schedule and Edit Schedule are one action opening one modal. The
	// schedule spans the tournament, so there is nothing to choose on the way in:
	// the modal opens on whatever schedule exists, empty or not.
	const [scheduleOpen, setScheduleOpen] = useState(false);

	// The server validates the whole schedule before writing it and names the rule
	// it broke, so a rejection is shown as it arrives rather than reworded here.
	// The returned shape is what ScheduleMakerModal reads to decide whether to
	// stay open on a failed save.
	const handleSaveSchedule = async (schedule) => {
		try {
			await updateTournamentSchedule(id, schedule);

			// Refetch, because tournament.schedule is what decides between the
			// unscheduled and scheduled states of the Fixtures tab underneath.
			reload();
			return { success: true };
		} catch (apiError) {
			showMessage(apiError.message, 'error');
			// data carries the rule's details — the offending entry id(s) — which
			// the modal uses to highlight and scroll to the entry that broke it.
			return { success: false, message: apiError.message, data: apiError.data };
		}
	};

	// Rendered on mount, before the request resolves. Only the content area below
	// waits, so LoadingScreen is deliberately not used here.
	return (
		<>
			{/* Mounted only while open, so the fixture set is not rebuilt on every
			    render of the page behind it. */}
			{/* Organiser only, and only while a fixture is chosen. Guarded on
			    creator as well as on the id, so a session that ends while the
			    modal is open cannot leave a write control on screen. */}
			{scoringFixture && result.data?.creator && (
				<ScoreUpdateModal
					fixture={scoringFixture}
					onClose={() => setScoringFixtureId(null)}
					onSave={handleSaveScore}
					onEndMatch={handleEndMatch}
					onCancelMatch={handleCancelMatch}
				/>
			)}

			{progressingDivisionId && result.data?.creator && (
				<NextRoundModal
					divisionId={progressingDivisionId}
					onConfirmed={handleRoundProgressed}
					onCancel={() => setProgressingDivisionId(null)}
				/>
			)}

			{scheduleOpen && result.data?.creator && (
				<Suspense fallback={<LoadingScreen />}>
					<ScheduleMakerModal
						isOpen
						tournament={result.data.tournament}
						divisions={result.data.divisions}
						tournamentName={result.data.tournament?.name}
						canEdit
						onClose={() => setScheduleOpen(false)}
						onSave={handleSaveSchedule}
					/>
				</Suspense>
			)}

			<TournamentShell tournamentId={id} name={title} creator={result.data?.creator}>
				{loading && <SectionState variant="loading" />}
				{!loading && result.error && (
					<SectionState
						variant="error"
						title="This tournament could not be loaded"
						message={result.error}
						onRetry={reload}
					/>
				)}
				{!loading && !result.error && result.data && (
					<TabPanel
						tab={activeTab}
						data={result.data}
						selectedDivisionId={selectedDivisionId}
						onOpenDivision={handleOpenDivision}
						onSelectDivision={setSelectedDivisionId}
						onOpenSchedule={() => setScheduleOpen(true)}
						onReload={reload}
						onDeleted={handleDeleted}
						renderFixtureAction={renderFixtureAction}
						onProgressRound={setProgressingDivisionId}
						onSelectTab={selectTab}
						onPrintAllScoresheets={handlePrintAllScoresheets}
						scoresheetTemplateSelected={Boolean(scoresheetTemplateKey)}
						scoresheetTemplateReady={Boolean(resolvedScoresheetTemplate)}
					/>
				)}
			</TournamentShell>
		</>
	);
}

function TabPanel({
	tab,
	data,
	selectedDivisionId,
	onOpenDivision,
	onSelectDivision,
	onOpenSchedule,
	onReload,
	onDeleted,
	renderFixtureAction,
	onProgressRound,
	onSelectTab,
	onPrintAllScoresheets,
	scoresheetTemplateSelected,
	scoresheetTemplateReady,
}) {
	if (tab === 'overview') {
		return (
			<OverviewTab
				tournament={data.tournament}
				dashboard={data.dashboard}
				onOpenDivision={onOpenDivision}
				creator={data.creator}
				onChanged={onReload}
				onDeleted={onDeleted}
			/>
		);
	}

	// One tab, two states, and the tournament decides which. There is deliberately
	// no control that switches between them: whether a schedule exists is a fact
	// about the tournament, not a preference of the reader.
	//
	// Presence of tournament.schedule is not enough: resetting a schedule and
	// saving it leaves a non-null schedule with zero entries, and that should
	// read the same as never having created one — grouped by status, not as a
	// wall of "Not yet scheduled". At least one fixture actually placed is what
	// makes it the scheduled state.
	if (tab === 'fixtures') {
		const hasScheduledFixture = getScheduleForTournament(data.tournament ?? {}).entries.some(
			(entry) => entry.type === 'fixture',
		);

		return (
			<>
				<RoundCompleteBanner
					divisions={data.divisions ?? []}
					creator={data.creator}
					onGoToStandings={() => onSelectTab('standings')}
				/>
				{hasScheduledFixture ? (
					<ScheduleTab
						tournament={data.tournament}
						divisions={data.divisions ?? []}
						creator={data.creator}
						onEditSchedule={onOpenSchedule}
						renderFixtureAction={renderFixtureAction}
						onPrintAllScoresheets={onPrintAllScoresheets}
						scoresheetTemplateSelected={scoresheetTemplateSelected}
						scoresheetTemplateReady={scoresheetTemplateReady}
					/>
				) : (
					<FixturesTab
						divisions={data.divisions ?? []}
						creator={data.creator}
						onCreateSchedule={onOpenSchedule}
						renderFixtureAction={renderFixtureAction}
					/>
				)}
			</>
		);
	}

	if (tab === 'standings') {
		return (
			<StandingsTab
				divisions={data.divisions ?? []}
				selectedDivisionId={selectedDivisionId}
				onSelectDivision={onSelectDivision}
				creator={data.creator}
				onProgressRound={onProgressRound}
			/>
		);
	}

	return (
		<TeamsTab
			divisions={data.divisions ?? []}
			selectedDivisionId={selectedDivisionId}
			onSelectDivision={onSelectDivision}
			creator={data.creator}
			// Reseeding is gated on Not Started, and the tab offers the handle
			// only where the server would accept the request.
			status={data.tournament?.status}
			onChanged={onReload}
		/>
	);
}
