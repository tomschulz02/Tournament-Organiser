import { Fragment, useLayoutEffect, useRef } from 'react';
import BracketView from './tournament/BracketView';
import { setScores, setsWon } from './tournament/fixtureUtils';
import { divisionColorStyle } from '../utils/divisionColors';
import { BODY_BUDGET } from '../utils/resultsExportLayout';
// The bracket's own styles. Class-scoped, so loading them here changes nothing
// else; this route is outside the shell that normally brings them in.
import '../styles/tournament-view.css';

// The printed pages of a results export: fixed A4 sheets, each with its own
// header and footer. What goes on which sheet is decided before this file is
// reached, by utils/resultsExportLayout.js — nothing here measures or breaks
// anything, and nothing here computes a result. Styled by
// styles/results-export.css, which pages/ResultsPrint.jsx injects.

// The brand artwork, from public/assets. The header wordmark is drawn on white
// with two lines crossing it; the stylesheet continues those lines to the left
// edge of the sheet.
const HEADER_MARK = '/assets/9.webp';
// The cover band: deep blue, court line art, the monogram and the wordmark.
const COVER_ART = '/assets/2.webp';

function PageHeader({ tournamentName, pageNumber, pageCount }) {
	return (
		<div className="rx-head">
			<i className="rx-head-line is-cyan" />
			<i className="rx-head-line is-sky" />
			<i className="rx-head-line is-periwinkle" />
			<img className="rx-head-mark" src={HEADER_MARK} alt="Tourganiser" />
			<p className="rx-running">
				{tournamentName} · Page {pageNumber} of {pageCount}
			</p>
		</div>
	);
}

function PageFooter() {
	return (
		<div className="rx-foot">
			<span>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="9" />
					<path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" />
				</svg>
				tourganiser.co.za
			</span>
			<span>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="m4 7 8 6 8-6" />
				</svg>
				support@tourganiser.co.za
			</span>
			<span>
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<rect x="4" y="4" width="16" height="16" rx="4.5" />
					<circle cx="12" cy="12" r="3.6" />
					<path d="M16.6 7.4h.01" />
				</svg>
				tourganiser.co.za
			</span>
		</div>
	);
}

// One sheet. `title` is the page's centred heading; `subtitle` is the one line
// under it, which the layout budgets for when it is present.
function ResultsPage({ title, subtitle, tournamentName, pageNumber, pageCount, children }) {
	return (
		<article className="rx-page">
			<PageHeader tournamentName={tournamentName} pageNumber={pageNumber} pageCount={pageCount} />
			<div className="rx-body">
				<h1 className="rx-title">{title}</h1>
				{subtitle && <p className="rx-subtitle">{subtitle}</p>}
				{children}
			</div>
			<PageFooter />
		</article>
	);
}

// 1 -> "st", 22 -> "nd", 13 -> "th".
function ordinalSuffix(rank) {
	const tens = rank % 100;
	if (tens >= 11 && tens <= 13) return 'th';

	return { 1: 'st', 2: 'nd', 3: 'rd' }[rank % 10] ?? 'th';
}

function DivisionHeading({ division, divisions, continued }) {
	return (
		<h2 className="rx-heading" style={divisionColorStyle(division.id, divisions)}>
			<i className="rx-dot" />
			<span>{division.name}</span>
			{continued && <small>continued</small>}
		</h2>
	);
}

// One division's column: places 1 to 3 as tinted blocks, the rest as a list.
// The rank and the note are the server's, shown as sent.
function RankingColumn({ column, divisions }) {
	return (
		<section>
			<DivisionHeading division={column.division} divisions={divisions} continued={column.continued} />
			<ol className="rx-rank-list">
				{column.rows.map(({ type, row }) =>
					type === 'rankingRow' ? (
						<li key={row.team_id ?? `${row.rank}:${row.name}`} className="rx-placing">
							<span className="rx-placing-rank">{row.rank}</span>
							<span className="rx-placing-team">{row.name}</span>
						</li>
					) : (
						<li
							key={row.team_id ?? `${row.rank}:${row.name}`}
							className={type === 'rankingFirst' ? 'rx-honour is-first' : 'rx-honour'}>
							<b className="rx-honour-rank">
								{row.rank}
								<sup>{ordinalSuffix(row.rank)}</sup>
							</b>
							<span className="rx-honour-text">
								{row.note && <span className="rx-honour-label">{row.note}</span>}
								<span className="rx-honour-team">{row.name}</span>
							</span>
						</li>
					),
				)}
			</ol>
		</section>
	);
}

function RankingColumns({ columns, divisions }) {
	return (
		<div className="rx-rank-cols">
			{columns.map((column, position) =>
				column ? (
					<RankingColumn key={column.division.id} column={column} divisions={divisions} />
				) : (
					<div key={`empty-${position}`} />
				),
			)}
		</div>
	);
}

// The final results export. `pages` comes from finalRankingPages: each page a
// list of columns, null where the division beside it ran longer.
export function FinalRankingPages({ pages, tournamentName, divisions }) {
	return (
		<div className="rx-pages">
			{pages.map((columns, index) => (
				<ResultsPage
					key={index}
					title="Final Ranking"
					tournamentName={tournamentName}
					pageNumber={index + 1}
					pageCount={pages.length}>
					<RankingColumns columns={columns} divisions={divisions} />
				</ResultsPage>
			))}
		</div>
	);
}

// One completed fixture: the on-screen row's anatomy without its schedule,
// status or action. Sets won and the winner's bold name are read off the result
// with the same helper FixtureRow uses, so paper and screen cannot disagree.
function FixtureCard({ fixture, divisions }) {
	const sets = setsWon(fixture.result);
	const scores = setScores(fixture.result);
	const teams = [fixture.team1, fixture.team2];

	return (
		<li className="rx-card">
			<div className="rx-card-meta" style={divisionColorStyle(fixture.division_id, divisions)}>
				<span className="rx-card-no">Match {fixture.match_no}</span>
				<span className="rx-card-division">
					<i className="rx-dot" />
					<span>{fixture.division_name}</span>
				</span>
				<span className="rx-card-round">{fixture.round}</span>
			</div>

			<div className="rx-card-teams">
				{teams.map((team, side) => {
					const won = sets ? sets[side] > sets[1 - side] : false;

					return (
						<Fragment key={side}>
							<span className={won ? 'rx-card-name is-winner' : 'rx-card-name'}>{team}</span>
							<span className={won ? 'rx-card-sets is-winner' : 'rx-card-sets'}>{sets ? sets[side] : ''}</span>
							<span className="rx-card-scores">{scores ? scores[side].join('  ') : ''}</span>
						</Fragment>
					);
				})}
			</div>
		</li>
	);
}

// A ratio with a zero denominator arrives non-finite — missing, after JSON —
// and reads MAX, as it does on the Standings tab.
function formatRatio(value) {
	return Number.isFinite(value) ? value.toFixed(3) : 'MAX';
}

// The standings table's columns, fixed. The figures are the server's row,
// shown as sent and in the order sent.
const STANDINGS_COLUMNS = [
	['Played', (row) => row.played],
	['Won', (row) => row.won],
	['Lost', (row) => row.lost],
	['Sets won', (row) => row.setsWon],
	['Sets lost', (row) => row.setsLost],
	['Set ratio', (row) => formatRatio(row.setsRatio)],
	['Pts for', (row) => row.pointsFor],
	['Pts against', (row) => row.pointsAgainst],
	['Pts ratio', (row) => formatRatio(row.pointsRatio)],
];

// A page's blocks, already cut to fit by the layout module: division headings,
// round names, fixture cards, and standings tables as a head and rows.
function BlockList({ blocks, divisions }) {
	return (
		<ul className="rx-blocks">
			{blocks.map((block, index) => {
				if (block.type === 'card') {
					return <FixtureCard key={block.fixture.id} fixture={block.fixture} divisions={divisions} />;
				}

				if (block.type === 'heading') {
					return (
						<li key={`heading:${block.division.id}`}>
							<DivisionHeading division={block.division} divisions={divisions} continued={block.continued} />
						</li>
					);
				}

				if (block.type === 'tableHead') {
					return (
						<li key={`head:${block.key}`} className="rx-table-head">
							<span className="rx-table-pos">Pos</span>
							<span className="rx-table-team">
								{block.label}
								{block.continued && <small>continued</small>}
							</span>
							{STANDINGS_COLUMNS.map(([label]) => (
								<span key={label}>{label}</span>
							))}
						</li>
					);
				}

				if (block.type === 'tableRow') {
					return (
						<li key={`row:${block.key}:${block.row.id ?? block.position}`} className="rx-table-row">
							<span className="rx-table-pos">{block.position}</span>
							<span className="rx-table-team">{block.row.name}</span>
							{STANDINGS_COLUMNS.map(([label, read]) => (
								<span key={label}>{read(block.row)}</span>
							))}
						</li>
					);
				}

				if (block.type === 'gap') return <li key={`gap:${index}`} className="rx-gap" />;

				return (
					<li key={`round:${block.division.id}:${block.round}`} className="rx-round">
						<span>{block.round}</span>
						{block.continued && <small>continued</small>}
					</li>
				);
			})}
		</ul>
	);
}

// The width of a sheet's body: 794px less 45px either side.
const TREE_WIDTH = 704;

// A division's knockout as the app's own bracket, on one page. The bracket is
// BracketView unchanged — its layout and its connectors are not copied here —
// inside a wrapper that pins the light values of the theme tokens it reads and
// then shrinks it, once laid out, until it fits the sheet. It is never split:
// a tree cut across two pages stops being a tree.
//
// The fit is written straight to the element rather than held in state. It is a
// measurement of what was just rendered, not something the page decides.
function KnockoutTree({ division, height }) {
	const frame = useRef(null);

	useLayoutEffect(() => {
		const node = frame.current;
		if (!node) return;

		node.style.zoom = '1';
		const fit = Math.min(1, TREE_WIDTH / node.offsetWidth, height / node.offsetHeight);
		node.style.zoom = String(fit);
	}, [division, height]);

	return (
		<div className="rx-tree">
			<div className="rx-tree-frame" ref={frame}>
				<BracketView rounds={division.bracket?.rounds ?? []} />
			</div>
		</div>
	);
}

// The fixture results export. `pages` comes from fixtureExportPages: card pages
// already cut to fit, and a tree page for a division whose knockout is drawn.
export function FixtureResultPages({ pages, description, tournamentName, divisions }) {
	return (
		<div className="rx-pages">
			{pages.map((page, index) =>
				page.kind === 'tree' ? (
					<ResultsPage
						key={index}
						title={`Knockout – ${page.division.name}`}
						tournamentName={tournamentName}
						pageNumber={index + 1}
						pageCount={pages.length}>
						<KnockoutTree division={page.division} height={BODY_BUDGET} />
					</ResultsPage>
				) : (
					<ResultsPage
						key={index}
						title="Fixture Results"
						subtitle={description}
						tournamentName={tournamentName}
						pageNumber={index + 1}
						pageCount={pages.length}>
						<BlockList blocks={page.blocks} divisions={divisions} />
					</ResultsPage>
				),
			)}
		</div>
	);
}

// The pack's first sheet: the cover artwork edge to edge, the tournament's
// name, and what the pack covers. No page header — the artwork is the header.
// Dates are the server's labels, shown as sent.
function CoverPage({ tournament, dashboard, divisions }) {
	const start = tournament.start_date_label;
	const end = tournament.end_date_label;
	const dates = start && end && start !== end ? `${start} – ${end}` : start || end || null;
	const teams = dashboard?.totalTeams ?? 0;
	const matches = dashboard?.completedFixtureCount ?? 0;

	return (
		<article className="rx-page rx-cover">
			<img className="rx-cover-art" src={COVER_ART} alt="Tourganiser" />
			<div className="rx-cover-title">
				<h1>{tournament.name}</h1>
				<p className="rx-cover-kind">Results pack</p>
				<dl>
					{dates && (
						<div>
							<dt>Dates</dt>
							<dd>{dates}</dd>
						</div>
					)}
					{tournament.location && (
						<div>
							<dt>Venue</dt>
							<dd>{tournament.location}</dd>
						</div>
					)}
					<div>
						<dt>Divisions</dt>
						<dd>{divisions.map((division) => division.name).join(', ')}</dd>
					</div>
					<div>
						<dt>Played</dt>
						<dd>
							{teams} {teams === 1 ? 'team' : 'teams'} · {matches} {matches === 1 ? 'match' : 'matches'}
						</dd>
					</div>
				</dl>
			</div>
			<PageFooter />
		</article>
	);
}

const PACK_TITLES = { ranking: 'Final Ranking', standings: 'Standings', results: 'Results' };

// The full results pack. `pages` comes from packPages, in print order; page
// numbers count the whole pack, the cover being page 1.
export function ResultsPackPages({ pages, tournament, dashboard, divisions }) {
	return (
		<div className="rx-pages">
			{pages.map((page, index) =>
				page.kind === 'cover' ? (
					<CoverPage key="cover" tournament={tournament} dashboard={dashboard} divisions={divisions} />
				) : (
					<ResultsPage
						key={index}
						title={page.kind === 'knockout' ? `Knockout – ${page.division.name}` : PACK_TITLES[page.kind]}
						tournamentName={tournament.name}
						pageNumber={index + 1}
						pageCount={pages.length}>
						{page.kind === 'ranking' && <RankingColumns columns={page.columns} divisions={divisions} />}
						{page.kind === 'knockout' && <KnockoutTree division={page.division} height={BODY_BUDGET} />}
						{(page.kind === 'standings' || page.kind === 'results') && (
							<BlockList blocks={page.blocks} divisions={divisions} />
						)}
					</ResultsPage>
				),
			)}
		</div>
	);
}
