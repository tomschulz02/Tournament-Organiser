import { Suspense, lazy, useState } from 'react';
import DivisionBadge from './DivisionBadge';
import SectionState from './SectionState';
import { isNotStarted } from './tournamentStatus';
import Icon from '../Icons';
import LoadingScreen from '../LoadingScreen';
import { useConfirm } from '../ConfirmDialog';
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
import { createEmptyDivision, isConfigurableFormat } from '../create/divisionFormats';
import {
	addDivision,
	deleteDivision,
	deleteTournament,
	endTournament,
	startTournament,
	updateTournamentScoresheetTemplate,
} from '../../requests';
import { divisionColorStyle } from '../../utils/divisionColors';

// Split out of the main bundle for the same reason ScheduleMakerModal is
// (see pages/View.jsx): it pulls in pdfjs-dist for the marker-placement
// preview, which only an organiser opens, and only deliberately.
const ScoresheetTemplateModal = lazy(() => import('./ScoresheetTemplateModal'));

// The tournament dashboard. Three bands: what this tournament is, what its
// divisions are, and what has just happened or is about to.
//
// Deliberately not a list of everything. Fixture lists, standings tables and
// team lists each have their own tab; reproducing them here would make Overview
// the only page anyone uses and the other three redundant.
export default function OverviewTab({
	tournament = {},
	dashboard = {},
	onOpenDivision,
	creator = false,
	onChanged,
	onDeleted,
}) {
	useHelpTopic('tournament-overview');

	const divisions = dashboard.divisions ?? [];

	return (
		<div className="tv-overview">
			<TournamentInformation
				tournament={tournament}
				dashboard={dashboard}
				creator={creator}
				onChanged={onChanged}
				onDeleted={onDeleted}
			/>
			<DivisionsBand
				divisions={divisions}
				onOpenDivision={onOpenDivision}
				tournamentId={tournament.id}
				status={tournament.status}
				creator={creator}
				onChanged={onChanged}
			/>
			<ActivityBand dashboard={dashboard} />
		</div>
	);
}

// The only place the tournament's own metadata appears. The subheader carries
// the name and nothing else, so this band is where a reader finds out what they
// are looking at.
function TournamentInformation({ tournament, dashboard, creator, onChanged, onDeleted }) {
	// Both labels are pre-formatted by the backend ('1 August 2026'). Do not
	// reformat them here — the server owns date presentation.
	const start = tournament.start_date_label;
	const end = tournament.end_date_label;
	const dates = start && end ? `${start} — ${end}` : start || end || null;

	return (
		<section className="tv-band">
			<div className="tv-info-card">
				<div className="tv-info-header">
					<StatusPill status={tournament.status} />
					{tournament.type && <span className="tv-info-format">{tournament.type}</span>}
				</div>

				{tournament.description && <p className="tv-info-description">{tournament.description}</p>}

				<dl className="tv-info-grid">
					{tournament.location && <InfoItem label="Location" value={tournament.location} icon="location" />}
					{dates && <InfoItem label="Dates" value={dates} icon="calendar" />}
					<InfoItem label="Divisions" value={dashboard.divisionCount ?? 0} icon="structure" stat />
					<InfoItem label="Teams" value={dashboard.totalTeams ?? 0} icon="teams" stat />
				</dl>

				{creator && (
					<LifecycleActions
						tournamentId={tournament.id}
						status={tournament.status}
						name={tournament.name}
						scoresheetTemplate={tournament.scoresheet_template}
						onChanged={onChanged}
						onDeleted={onDeleted}
					/>
				)}
			</div>
		</section>
	);
}

// The organiser's control over the tournament as a whole. Absent entirely for a
// viewer, rather than shown disabled.
//
// Only the transition the tournament is actually in is offered: a finished
// tournament has neither. The server refuses the others with a 409 regardless —
// this is presentation, not enforcement.
function LifecycleActions({ tournamentId, status, name, scoresheetTemplate, onChanged, onDeleted }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);
	const [templateModalOpen, setTemplateModalOpen] = useState(false);

	const current = status || 'Not Started';

	const run = async (action, successMessage, after) => {
		setBusy(true);
		try {
			await action();
			showMessage(successMessage, 'success');
			after?.();
		} catch (apiError) {
			// Display-ready by contract, including the 409s.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	// Starting looks like the least consequential of the three and is the most:
	// it closes team and division editing for good. The message says both halves
	// — an organiser who believes the schedule locks too will put off starting,
	// and the schedule is the tool they most need once things overrun.
	const handleStart = async () => {
		const confirmed = await confirm(
			'Start this tournament? Teams and divisions can no longer be added, removed or reordered. The schedule can still be edited, and results can be entered once it has started.',
		);
		if (!confirmed) return;

		await run(() => startTournament(tournamentId), 'Tournament started.', () => onChanged?.());
	};

	const handleEnd = async () => {
		const confirmed = await confirm('End this tournament? No further results can be recorded.');
		if (!confirmed) return;

		await run(() => endTournament(tournamentId), 'Tournament finished.', () => onChanged?.());
	};

	// Deletion is permitted at every status, including part-way through. The
	// cascade is named here because that is what makes it a decision rather than
	// a surprise — the divisions, fixtures and results all go with it.
	const handleDelete = async () => {
		const ongoing = current === 'Ongoing' ? ' It is currently in progress.' : '';
		const confirmed = await confirm(
			`Delete ${name || 'this tournament'}?${ongoing} Its divisions, fixtures and results are deleted too. This cannot be undone.`,
		);
		if (!confirmed) return;

		await run(() => deleteTournament(tournamentId), 'Tournament deleted.', () => onDeleted?.());
	};

	// The picker hands back the key it wants selected, or null to clear it.
	// The endpoint is the only source of truth for the selection, so the modal
	// closes and the page refetches rather than the button holding its own copy.
	const handleSaveTemplate = async (templateKey) => {
		setTemplateModalOpen(false);
		await run(
			() => updateTournamentScoresheetTemplate(tournamentId, templateKey),
			'Scoresheet template updated.',
			() => onChanged?.(),
		);
	};

	return (
		<div className="tv-info-actions">
			{current === 'Not Started' && (
				<button type="button" className="tv-primary-action" disabled={busy} onClick={handleStart}>
					Start Tournament
				</button>
			)}

			{current === 'Ongoing' && (
				<button type="button" className="tv-primary-action" disabled={busy} onClick={handleEnd}>
					End Tournament
				</button>
			)}

			<button type="button" className="tv-subtle-action" disabled={busy} onClick={() => setTemplateModalOpen(true)}>
				Scoresheet Template
			</button>

			<button
				type="button"
				className="tv-subtle-action tv-subtle-action--danger"
				disabled={busy}
				onClick={handleDelete}>
				<Icon name='delete' fill='var(--error-color)'></Icon>
			</button>

			{templateModalOpen && (
				<Suspense fallback={<LoadingScreen />}>
					<ScoresheetTemplateModal
						initialTemplateKey={scoresheetTemplate}
						onCancel={() => setTemplateModalOpen(false)}
						onSave={handleSaveTemplate}
					/>
				</Suspense>
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

function StatusPill({ status }) {
	const value = status || 'Not Started';
	const modifier = value.toLowerCase().replace(/\s+/g, '-');

	return <span className={`tv-status-pill tv-status-pill--${modifier}`}>{value}</span>;
}

// One card per division, summarising it and offering a way into the tab that
// holds the detail. No fixture lists and no standings — a card says how big a
// division is and how far through it is, and nothing more.
function DivisionsBand({ divisions, onOpenDivision, tournamentId, status, creator, onChanged }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState(false);

	// A division can only be added or removed before the tournament starts —
	// afterwards the schedule and the standings are describing a fixed set of
	// them. Absent entirely for a viewer, and absent once started, rather than
	// shown and then refused with a 409.
	const canCompose = creator && isNotStarted(status);

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
	// the payload is built the way buildPayload builds it: the count added, the
	// pool and qualifier settings included only for a format that has them, and
	// the local id dropped.
	const handleAdd = async (draft) => {
		setAdding(false);

		await run(
			() =>
				addDivision(tournamentId, {
					name: draft.name,
					type: draft.type,
					num_teams: draft.teams.length,
					...(isConfigurableFormat(draft.type) && {
						num_groups: Number(draft.num_groups),
						knockout_teams: Number(draft.knockout_teams),
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
			`Remove ${division.name}? Its ${division.teamCount ?? 0} teams, ${
				division.fixtureCount ?? 0
			} fixtures and any scheduled slots are removed too. This cannot be undone.`,
		);
		if (!confirmed) return;

		await run(() => deleteDivision(division.id), 'Division removed.');
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
							onOpenDivision={onOpenDivision}
							canRemove={canCompose}
							busy={busy}
							onRemove={handleRemove}
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
			{busy && <LoadingScreen />}

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

function DivisionCard({ division, onOpenDivision, canRemove = false, busy = false, onRemove }) {
	const total = division.fixtureCount ?? 0;
	const completed = division.completedFixtureCount ?? 0;
	// Guarded: a division with no fixtures yet would otherwise divide by zero.
	const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<article className="tv-division-card" style={divisionColorStyle(division.id)}>
			{/* A div, not a <header>. App.css styles the bare `header` element for
			    the site's fixed top bar — position: fixed, width: 100vw, height:
			    80px — so any <header> anywhere in the app is torn out of its
			    container. Avoid the bare landmark elements in this page entirely. */}
			<div className="tv-division-card-header">
				<h3>{division.name}</h3>
				{division.type && <span className="tv-info-format">{division.type}</span>}
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

// Both lists are already sorted and already capped at eight by the backend.
// Rendering them as given is the point: re-sorting or re-slicing here would put
// a second, competing definition of "recent" in the client.
function ActivityBand({ dashboard }) {
	const upcoming = dashboard.upcomingFixtures ?? [];
	const recent = dashboard.recentResults ?? [];

	return (
		<section className="tv-band">
			<h2 className="tv-band-heading">Activity</h2>

			<div className="tv-activity">
				<FixturePreviewList
					title="Up next"
					fixtures={upcoming}
					emptyMessage="Nothing is scheduled to play next."
				/>
				<FixturePreviewList title="Recent results" fixtures={recent} emptyMessage="No matches have finished yet." />
			</div>
		</section>
	);
}

function FixturePreviewList({ title, fixtures, emptyMessage }) {
	return (
		<div className="tv-activity-column">
			<h3 className="tv-activity-heading">{title}</h3>

			{fixtures.length === 0 ? (
				<p className="tv-activity-empty">{emptyMessage}</p>
			) : (
				<ul className="tv-fixture-previews">
					{fixtures.map((fixture) => (
						<FixturePreview key={fixture.id} fixture={fixture} />
					))}
				</ul>
			)}
		</div>
	);
}

function FixturePreview({ fixture }) {
	const score = formatResult(fixture.result);

	return (
		<li className="tv-fixture-preview">
			<div className="tv-fixture-preview-meta">
				{fixture.match_no != null && <span className="tv-match-no">#{fixture.match_no}</span>}
				<DivisionBadge id={fixture.division_id} name={fixture.division_name} />
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
