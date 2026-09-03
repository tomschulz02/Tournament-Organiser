import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleExportPages } from '../components/ScheduleExportView';
import scheduleExportCss from '../styles/schedule-export.css?raw';

// Builds the schedule's grid or list export as a standalone HTML document and
// opens it in a new tab as a Blob URL — the one mechanism both the organiser's
// own print/export action and every other viewer's "View/Print Schedule"
// button use. See docs/decisions.md.
//
// A real, separate document rather than a portal into the live app: it needs
// no access to the running React tree, works whether or not the viewer is
// signed in, and the reader triggers printing themselves from there (this
// codebase's own print control, or Ctrl+P) rather than the app opening a
// print dialog on their behalf.
export function openScheduleExportDocument({ schedule, fixturesById, tournamentName, tournamentId, type }) {
	const markup = renderToStaticMarkup(
		<ScheduleExportPages
			type={type}
			schedule={schedule}
			fixturesById={fixturesById}
			tournamentName={tournamentName}
			tournamentId={tournamentId}
		/>,
	);

	const html = buildDocument({ title: `${tournamentName} - Schedule`, type, markup });
	const blob = new Blob([html], { type: 'text/html' });
	const url = URL.createObjectURL(blob);

	window.open(url, '_blank', 'noopener');
	// The new tab needs time to load the blob before the URL is safe to
	// revoke; there is no load event to hook from here, so a generous delay
	// stands in for one — the same pattern View.jsx's scoresheet download
	// already uses for the same reason.
	setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// size/margin per type: the grid is wide (courts across the page, up to 6 per
// group per COURTS_PER_GROUP) and reads better landscape; the list is a
// single column of rows and reads better portrait — the same pairing the
// retired @page rules used.
function pageCss(type) {
	return type === 'grid'
		? '@page { size: A4 landscape; margin: 10mm; }'
		: '@page { size: A4 portrait; margin: 12mm; }';
}

function buildDocument({ title, type, markup }) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${scheduleExportCss}
${pageCss(type)}</style>
</head>
<body>
<div class="schedule-export-print-bar">
<button type="button" class="schedule-export-print-button" onclick="window.print()">Print</button>
</div>
${markup}
</body>
</html>`;
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
