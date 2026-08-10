// Printing the schedule.
//
// This used to rasterise the hidden export roots with html2canvas and assemble a
// PDF with jsPDF, downloading it immediately. The organiser never saw the
// document before it landed in their downloads folder, and a screenshot of a web
// page makes a poor printed page — the text was an image, so it could not be
// searched, selected or scaled.
//
// The browser's own print dialog is a preview, and its "Save as PDF" still
// covers the download case. There is deliberately only one path: two ways to
// produce the same document is two things to maintain and a choice the organiser
// should not have to make.
//
// All this does is say which of the two hidden export roots is being printed.
// The rest is a print stylesheet in App.css, keyed on the same attribute, which
// hides everything else and lets each [data-export-page] break onto its own
// sheet.

const PRINT_ATTRIBUTE = 'printSchedule';

export function printSchedule(view) {
	if (view !== 'grid' && view !== 'list') {
		throw new Error(`Unknown schedule print view: ${view}`);
	}

	document.body.dataset[PRINT_ATTRIBUTE] = view;

	// window.print blocks until the dialog closes in most browsers, but not in
	// all of them, so the attribute is cleared on the event rather than on the
	// next line.
	const clear = () => {
		delete document.body.dataset[PRINT_ATTRIBUTE];
		window.removeEventListener('afterprint', clear);
	};

	window.addEventListener('afterprint', clear);

	try {
		window.print();
	} catch (error) {
		clear();
		throw error;
	}
}
