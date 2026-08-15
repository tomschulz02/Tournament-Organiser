import { useState } from 'react';
import DivisionBadge from './DivisionBadge';
import SectionState from './SectionState';
import { useConfirm } from '../ConfirmDialog';
import { useMessage } from '../../MessageContext';
import { deleteTournament, endTournament, startTournament } from '../../requests';

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
			<DivisionsBand divisions={divisions} onOpenDivision={onOpenDivision} />
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
					{tournament.location && <InfoItem label="Location" value={tournament.location} />}
					{dates && <InfoItem label="Dates" value={dates} />}
					<InfoItem label="Divisions" value={dashboard.divisionCount ?? 0} />
					<InfoItem label="Teams" value={dashboard.totalTeams ?? 0} />
				</dl>

				{creator && (
					<LifecycleActions
						tournamentId={tournament.id}
						status={tournament.status}
						name={tournament.name}
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
function LifecycleActions({ tournamentId, status, name, onChanged, onDeleted }) {
	const confirm = useConfirm();
	const { showMessage } = useMessage();
	const [busy, setBusy] = useState(false);

	const current = status || 'Not Started';

	const run = async (action, successMessage, after) => {
		setBusy(true);
		try {
			await action();
			showMessage(successMessage, 'success');
			after();
		} catch (apiError) {
			// Display-ready by contract, including the 409s.
			showMessage(apiError.message, 'error');
		} finally {
			setBusy(false);
		}
	};

	const handleStart = () =>
		run(() => startTournament(tournamentId), 'Tournament started.', () => onChanged?.());

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

			<button
				type="button"
				className="tv-subtle-action tv-subtle-action--danger"
				disabled={busy}
				onClick={handleDelete}>
				Delete Tournament
			</button>
		</div>
	);
}

function InfoItem({ label, value }) {
	return (
		<div className="tv-info-item">
			<dt>{label}</dt>
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
function DivisionsBand({ divisions, onOpenDivision }) {
	return (
		<section className="tv-band">
			<h2 className="tv-band-heading">Divisions</h2>

			{divisions.length === 0 ? (
				<SectionState
					variant="empty"
					title="This tournament has no divisions"
					message="Divisions are added when the tournament is created."
				/>
			) : (
				<div className="tv-division-cards">
					{divisions.map((division) => (
						<DivisionCard key={division.id} division={division} onOpenDivision={onOpenDivision} />
					))}
				</div>
			)}
		</section>
	);
}

function DivisionCard({ division, onOpenDivision }) {
	const total = division.fixtureCount ?? 0;
	const completed = division.completedFixtureCount ?? 0;
	// Guarded: a division with no fixtures yet would otherwise divide by zero.
	const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

	return (
		<article className="tv-division-card">
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
				<DivisionBadge name={fixture.division_name} />
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
