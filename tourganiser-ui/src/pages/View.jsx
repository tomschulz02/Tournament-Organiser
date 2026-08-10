import { useNavigate, useParams } from 'react-router-dom';
import { Suspense, lazy, useContext, useEffect, useState } from 'react';
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
import LoadingScreen from '../components/LoadingScreen';
import ScoreUpdateModal from '../components/ScoreUpdateModal';
import NextRoundModal from '../components/NextRoundModal';
import { flattenFixtures } from '../components/tournament/fixtureUtils';
import { useMessage } from '../MessageContext';
import { updateFixtureResult, updateTournamentSchedule } from '../requests';

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
				const response = await fetchTournamentData(id);

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
	}, [id, requestKey]);

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

	// Offered only where a result can actually be recorded. A knockout fixture
	// still showing "Rank 1" has no teams bound, and the server rejects it with a
	// 400 — better not to offer the action than to explain the refusal.
	const renderFixtureAction = (fixture) => {
		if (!fixture.team_1_id || !fixture.team_2_id) return null;

		return (
			<button type="button" className="tv-subtle-action" onClick={() => setScoringFixtureId(fixture.id)}>
				{fixture.result?.length > 0 ? 'Edit Score' : 'Enter Score'}
			</button>
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
			return { success: false, message: apiError.message };
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

			<TournamentShell tournamentId={id} name={title}>
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
	if (tab === 'fixtures') {
		return data.tournament?.schedule ? (
			<ScheduleTab
				tournament={data.tournament}
				divisions={data.divisions ?? []}
				creator={data.creator}
				onEditSchedule={onOpenSchedule}
				renderFixtureAction={renderFixtureAction}
			/>
		) : (
			<FixturesTab
				divisions={data.divisions ?? []}
				creator={data.creator}
				onCreateSchedule={onOpenSchedule}
				renderFixtureAction={renderFixtureAction}
			/>
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
			onChanged={onReload}
		/>
	);
}
