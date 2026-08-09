import { useParams } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { fetchTournamentData } from '../requests';
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
import { useMessage } from '../MessageContext';
import { updateTournamentSchedule } from '../requests';

// Split out of the main bundle. The schedule maker pulls in the PDF export and
// with it jsPDF and DOMPurify — around two thirds of the whole bundle — for a
// screen only an organiser opens, and only deliberately.
const ScheduleMakerModal = lazy(() => import('../components/ScheduleMakerModal'));

export default function ViewPage() {
	const { id } = useParams();
	const { activeTab, selectTab } = useTournamentTab();
	const { showMessage } = useMessage();

	// Which division Standings and Teams are showing. Page state rather than URL
	// state: step 3 dropped ?division=, and a division is a choice within a
	// section, not a place. It lives here rather than inside those sections
	// because an Overview card has to be able to set it on the way in.
	//
	// null means "not chosen yet"; the sections fall back to the first division.
	const [selectedDivisionId, setSelectedDivisionId] = useState(null);

	// Retry bumps this, which changes the request key and re-runs the effect.
	const [attempt, setAttempt] = useState(0);
	const requestKey = `${id}:${attempt}`;

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

	// Create Schedule and Edit Schedule are one action opening one modal. The
	// schedule spans the tournament, so there is nothing to choose on the way in:
	// the modal opens on whatever schedule exists, empty or not.
	const [scheduleOpen, setScheduleOpen] = useState(false);

	// PUT /tournaments/:id/schedule answers 501 until it is implemented, so this
	// path currently ends in a toast. That is deliberate — per A2 the UI wires to
	// the real endpoint and surfaces the real message rather than special-casing
	// it. The returned shape is what ScheduleMakerModal reads to decide whether to
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
					/>
				)}
			</TournamentShell>
		</>
	);
}

function TabPanel({ tab, data, selectedDivisionId, onOpenDivision, onSelectDivision, onOpenSchedule, onReload }) {
	if (tab === 'overview') {
		return <OverviewTab tournament={data.tournament} dashboard={data.dashboard} onOpenDivision={onOpenDivision} />;
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
			/>
		) : (
			<FixturesTab divisions={data.divisions ?? []} creator={data.creator} onCreateSchedule={onOpenSchedule} />
		);
	}

	if (tab === 'standings') {
		return (
			<StandingsTab
				divisions={data.divisions ?? []}
				selectedDivisionId={selectedDivisionId}
				onSelectDivision={onSelectDivision}
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
