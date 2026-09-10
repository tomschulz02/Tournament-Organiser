import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { fetchTournamentData, updateTournamentSchedule } from '../requests';
import { ScheduleExportPages } from '../components/ScheduleExportView';
import SchedulePrintLayoutEditor from '../components/SchedulePrintLayoutEditor';
import { buildFixtureIndex, buildTournamentSchedule, pruneStalePrintLayout, serialiseScheduleForSave } from '../utils/scheduleUtils';
import scheduleExportCss from '../styles/schedule-export.css?raw';
import '../styles/schedule-print.css';

// The schedule, printable, at a real URL — /tournaments/view/:id/print.
//
// A route rather than the Blob-URL document ScheduleTab used to open, because a
// blob has no address: it cannot be bookmarked, shared with a club, or reopened
// after the tab is closed. It sits outside the App shell (see main.jsx), the
// same way /login does, so nothing of the site's header, navigation or footer
// reaches the paper.
//
// It fetches for itself rather than being handed data by whatever linked here.
// That is the whole point — a direct link has no router state to read, and this
// page must work for someone who arrives from a message rather than a click.
export default function SchedulePrintPage() {
	const { id } = useParams();
	// data.creator is resolved server-side from the session cookie, so the
	// session has to be part of the request key or logging in would not reveal
	// the editing controls. Same reasoning as View.jsx.
	const { sessionVersion } = useContext(AuthContext);
	// Bumped after a save, which changes the request key and re-runs the effect.
	// This page holds no copy of the saved schedule, so a save is only visible
	// once the request that produced it runs again — same pattern as View.jsx.
	const [attempt, setAttempt] = useState(0);
	const requestKey = `${id}:${attempt}:${sessionVersion}`;

	const [result, setResult] = useState({ key: null, data: null, error: null });

	useEffect(() => {
		let active = true;

		(async () => {
			try {
				const response = await fetchTournamentData(id, sessionVersion);

				if (active) setResult({ key: requestKey, data: response.data, error: null });
			} catch (apiError) {
				// Display-ready by contract.
				if (active) setResult({ key: requestKey, data: null, error: apiError.message });
			}
		})();

		return () => {
			active = false;
		};
	}, [id, requestKey, sessionVersion]);

	const loading = result.key !== requestKey;
	const tournament = result.data?.tournament ?? null;
	const creator = result.data?.creator ?? false;

	const { schedule, fixtures } = useMemo(
		() => buildTournamentSchedule(tournament ?? {}, result.data?.divisions ?? []),
		[tournament, result.data?.divisions],
	);
	const fixturesById = useMemo(() => buildFixtureIndex(fixtures), [fixtures]);

	const [type, setType] = useState('grid');
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	// The layouts being looked at or worked on. Seeded from the fetched
	// schedule, then owned here until saved — printing has to work on the
	// current arrangement without a save first.
	const [layouts, setLayouts] = useState(null);
	const [staleNoticeDismissed, setStaleNoticeDismissed] = useState(false);

	// Stale breaks are dropped for this load only, never written back — see
	// docs/schedule.md. A break naming a day or court the schedule no longer has
	// would otherwise silently shift every page after it.
	const pruned = useMemo(() => {
		const dayIds = schedule.days.map((day) => day.id);
		const courtIds = schedule.courts.map((court) => court.id);
		const grid = pruneStalePrintLayout(schedule.print?.grid ?? null, { dayIds, courtIds });
		const list = pruneStalePrintLayout(schedule.print?.list ?? null, { dayIds, courtIds });

		return { layouts: { grid: grid.layout, list: list.layout }, dropped: grid.dropped || list.dropped };
	}, [schedule]);

	useEffect(() => {
		setLayouts(pruned.layouts);
		setStaleNoticeDismissed(false);
	}, [pruned]);

	const activeLayout = layouts?.[type] ?? null;

	// Whether what is on screen differs from what is stored. Only ever used to
	// label the Save button — never to disable it, because a comparison that got
	// this wrong would silently refuse a save the organiser is entitled to make.
	const layoutsDirty = useMemo(() => JSON.stringify(layouts) !== JSON.stringify(pruned.layouts), [layouts, pruned.layouts]);

	const handleLayoutChange = (nextLayout) => setLayouts((current) => ({ ...current, [type]: nextLayout }));

	// Only the layout being edited is written; the other type's saved layout
	// rides along untouched, because the two are edited and saved
	// independently and a save of one must not discard the other.
	const handleSave = async () => {
		setSaving(true);
		try {
			await updateTournamentSchedule(id, serialiseScheduleForSave({ ...schedule, print: layouts }));
			setAttempt((count) => count + 1);
		} catch (apiError) {
			// No MessageProvider banner here: this page is outside the App shell,
			// so the message would have nowhere to render.
			setResult((current) => ({ ...current, error: apiError.message }));
		} finally {
			setSaving(false);
		}
	};

	// The export document's stylesheet, injected for the life of this page
	// rather than imported. Imported, its `body` and `:root` rules would outlive
	// the route and follow the reader back into the app; injected, the printed
	// page and the standalone Blob document are still guaranteed to be styled by
	// exactly the same text, which is what keeps the two outputs identical.
	useEffect(() => {
		const style = document.createElement('style');
		style.textContent = scheduleExportCss;
		document.head.appendChild(style);

		return () => style.remove();
	}, []);

	// The paper itself. A saved layout's orientation wins over the type's
	// default, because its breaks were chosen against that orientation.
	const orientation = activeLayout?.orientation || (type === 'grid' ? 'landscape' : 'portrait');

	useEffect(() => {
		const style = document.createElement('style');
		style.textContent =
			orientation === 'landscape' ? '@page { size: A4 landscape; margin: 10mm; }' : '@page { size: A4 portrait; margin: 12mm; }';
		document.head.appendChild(style);

		return () => style.remove();
	}, [orientation]);

	if (loading) {
		return (
			<div className="schedule-print-root">
				<p className="schedule-print-state">Loading the schedule…</p>
			</div>
		);
	}

	if (result.error && !tournament) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>{result.error}</p>
					<Link to="/tournaments">Back to tournaments</Link>
				</div>
			</div>
		);
	}

	// Nothing to print is a different answer from a failed load, and the reader
	// needs to be told which. A tournament with no schedule has no pages.
	if (!tournament?.schedule) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>This tournament does not have a schedule yet.</p>
					<Link to={`/tournaments/view/${id}`}>Back to the tournament</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="schedule-print-root">
			<div className="schedule-print-bar">
				<div className="schedule-print-bar-identity">
					<Link to={`/tournaments/view/${id}`} className="schedule-print-back">
						← {tournament.name}
					</Link>
				</div>

				<div className="schedule-print-bar-actions">
					<div className="schedule-print-types" role="group" aria-label="Schedule layout">
						{['grid', 'list'].map((option) => (
							<button
								key={option}
								type="button"
								className="schedule-print-choice"
								aria-pressed={type === option}
								onClick={() => setType(option)}>
								{option === 'grid' ? 'Grid' : 'List'}
							</button>
						))}
					</div>

					{/* Organiser only, and the only editing affordance on the page —
					    a viewer sees the saved arrangement and nothing that suggests
					    it can be changed. */}
					{creator && (
						<button type="button" className="schedule-print-action" onClick={() => setEditing((value) => !value)}>
							{editing ? 'Done editing' : 'Edit page breaks'}
						</button>
					)}

					{/* Named for what it does to the stored layout rather than just
					    "Save", and it says when there is something to save — an
					    organiser who has moved a break needs to be able to tell at a
					    glance whether it is only on their screen. */}
					{creator && editing && (
						<button type="button" className="schedule-print-action is-primary" disabled={saving} onClick={handleSave}>
							{saving ? 'Saving…' : layoutsDirty ? 'Save layout •' : 'Save layout'}
						</button>
					)}

					{creator && editing && layoutsDirty && !saving && <span className="schedule-print-dirty">Unsaved changes</span>}

					{/* Never gated on having saved first: what is on screen is what
					    prints, saved or not. */}
					<button type="button" className="schedule-print-action is-primary" onClick={() => window.print()}>
						Print
					</button>
				</div>
			</div>

			{result.error && <p className="schedule-print-error">{result.error}</p>}

			{creator && pruned.dropped && !staleNoticeDismissed && (
				<div className="schedule-print-notice">
					<p>This saved layout may not reflect recent schedule changes — some page breaks pointed at a day or court that no longer exists.</p>
					<button type="button" onClick={() => setStaleNoticeDismissed(true)}>
						Dismiss
					</button>
				</div>
			)}

			{creator && editing && (
				<div className="schedule-print-editor">
					<SchedulePrintLayoutEditor
						type={type}
						schedule={schedule}
						fixturesById={fixturesById}
						layout={activeLayout}
						onChange={handleLayoutChange}
					/>
				</div>
			)}

			{/* Always rendered, and in edit mode shown only on paper. That is what
			    lets Print work on the current arrangement mid-edit without a save
			    and without printing the gutters — the editor is the screen view of
			    the same layout these pages are the paper view of, so there is no
			    second copy of the arrangement to keep in step. */}
			<div className={editing ? 'schedule-print-pages is-print-only' : 'schedule-print-pages'}>
				<ScheduleExportPages
					type={type}
					schedule={schedule}
					fixturesById={fixturesById}
					tournamentName={tournament.name}
					tournamentId={tournament.id}
					divisions={result.data?.divisions ?? []}
					layout={activeLayout}
				/>
			</div>
		</div>
	);
}
