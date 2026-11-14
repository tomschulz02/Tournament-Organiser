import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { fetchTournamentData } from '../requests';
import { FinalRankingPages, FixtureResultPages, ResultsPackPages } from '../components/ResultsExportView';
import {
	describeFilters,
	filtersFromQuery,
	finalRankingPages,
	fixtureExportPages,
	groupFixtures,
	isExportKind,
	packPages,
	selectExportFixtures,
	usesKnockoutTree,
} from '../utils/resultsExportLayout';
import { buildTournamentSchedule } from '../utils/scheduleUtils';
import resultsExportCss from '../styles/results-export.css?raw';
// The route's own toolbar and plain states, shared with the schedule print.
// Nothing in it reaches paper.
import '../styles/schedule-print.css';

// A tournament's results, printable — /tournaments/view/:id/results/:kind, where
// kind is which export: "final" (the final ranking), "fixtures" (completed
// fixtures, narrowed by the filters in the query string) or "pack" (the whole
// tournament: cover, final ranking, then each division's standings and results).
//
// Built the way SchedulePrint.jsx is, and for its reasons: outside the App shell
// (see main.jsx) so no site chrome reaches the paper, and fetching for itself so
// the address works when opened directly.
//
// Offered to the organiser and collaborators only. That is presentation, not
// security: every figure on these pages is already public in the tournament
// view. It keeps an official-looking record from being produced by anyone.
export default function ResultsPrintPage() {
	const { id, kind } = useParams();
	const [searchParams] = useSearchParams();
	// data.can is resolved server-side from the session cookie, so the session
	// is part of the request key. Same reasoning as SchedulePrint.jsx.
	const { sessionVersion } = useContext(AuthContext);
	const requestKey = `${id}:${sessionVersion}`;

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

	// The pages' stylesheet, injected for the life of this page rather than
	// imported: its `html` and `body` rules must not outlive the route.
	useEffect(() => {
		const style = document.createElement('style');
		// No page margin: the sheets carry their own, and the footer band has to
		// reach the paper's edge.
		style.textContent = `${resultsExportCss}\n@page { size: A4 portrait; margin: 0; }`;
		document.head.appendChild(style);

		return () => style.remove();
	}, []);

	const loading = result.key !== requestKey;
	const tournament = result.data?.tournament ?? null;
	const divisions = result.data?.divisions;
	const allowed = result.data?.can?.enterCurrentRoundResults ?? false;

	const rankingPages = useMemo(() => finalRankingPages(divisions ?? []), [divisions]);

	// The fixture export: what the Fixtures & Schedule tab was filtered to when
	// the link was followed, completed fixtures only. Day and court are read
	// through the schedule's entries, as the tab reads them.
	const fixtureExport = useMemo(() => {
		const filters = filtersFromQuery(searchParams);
		const { schedule } = buildTournamentSchedule(tournament ?? {}, divisions ?? []);
		const selected = selectExportFixtures({ divisions: divisions ?? [], filters, schedule });

		return {
			// A knockout is drawn as a tree only while nothing but the division
			// is filtered: any other filter can take matches out of it.
			pages: fixtureExportPages({
				groups: groupFixtures(divisions ?? [], selected),
				tree: usesKnockoutTree('fixtures', filters),
			}),
			description: describeFilters({ filters, divisions: divisions ?? [], schedule, count: selected.length }),
		};
	}, [searchParams, tournament, divisions]);

	const pack = useMemo(() => packPages({ divisions: divisions ?? [] }), [divisions]);

	const back = <Link to={`/tournaments/view/${id}`}>Back to the tournament</Link>;

	if (loading) {
		return (
			<div className="schedule-print-root">
				<p className="schedule-print-state">Loading the results…</p>
			</div>
		);
	}

	if (result.error || !tournament) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>{result.error || 'This tournament could not be loaded.'}</p>
					<Link to="/tournaments">Back to tournaments</Link>
				</div>
			</div>
		);
	}

	if (!isExportKind(kind)) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>There is no results export at this address.</p>
					{back}
				</div>
			</div>
		);
	}

	if (!allowed) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>Results exports are available to the organiser and collaborators of this tournament.</p>
					{back}
				</div>
			</div>
		);
	}

	// Nothing to print is a different answer from a failed load.
	if (kind === 'fixtures' && fixtureExport.pages.length === 0) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>No completed fixtures match these filters, so there are no results to export.</p>
					{back}
				</div>
			</div>
		);
	}

	if (kind === 'pack' && pack.length === 0) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>No match has been completed yet, so there is nothing to put in a results pack.</p>
					{back}
				</div>
			</div>
		);
	}

	if (kind === 'final' && rankingPages.length === 0) {
		return (
			<div className="schedule-print-root">
				<div className="schedule-print-state">
					<p>This tournament has no final results yet. They appear as each division's rounds are completed.</p>
					{back}
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
					<button type="button" className="schedule-print-action is-primary" onClick={() => window.print()}>
						Print
					</button>
				</div>
			</div>

			{kind === 'pack' && (
				<ResultsPackPages
					pages={pack}
					tournament={tournament}
					dashboard={result.data?.dashboard}
					divisions={divisions ?? []}
				/>
			)}

			{kind === 'final' && (
				<FinalRankingPages pages={rankingPages} tournamentName={tournament.name} divisions={divisions ?? []} />
			)}

			{kind === 'fixtures' && (
				<FixtureResultPages
					pages={fixtureExport.pages}
					description={fixtureExport.description}
					tournamentName={tournament.name}
					divisions={divisions ?? []}
				/>
			)}
		</div>
	);
}
