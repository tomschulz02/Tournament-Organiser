import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { FixtureCard } from './ViewTabs';

export default function FixturesDoc({ tournament, fixtures, link = 'https://tourganiser.co.za/' }) {
	return (
		<div className="fixtures-doc">
			<div className="fixtures-doc-image"></div>
			<div className="fixtures-doc-title">{tournament}</div>
			<div className="fixtures-doc-subtitle">Schedule & Results</div>
			<div className="schedule-tab-content">
				{fixtures.map((fixture, index) => {
					return <FixtureCard key={index} fixture={fixture} />;
				})}
			</div>
		</div>
	);
}

export async function downloadPDF({ elementId, filename = 'document.pdf', preview = false }) {
	const element = document.getElementById(elementId);
	if (!element) {
		console.error('Element not found:', elementId);
		return;
	}

	// --- SANITIZE COLORS ---
	const sanitizeColors = (el) => {
		const children = el.querySelectorAll('*');
		children.forEach((child) => {
			const computed = getComputedStyle(child);

			// force all colors to rgb/rgba
			if (computed.color) child.style.color = computed.color;
			if (computed.backgroundColor) child.style.backgroundColor = computed.backgroundColor;
			if (computed.borderColor) child.style.borderColor = computed.borderColor;
		});
		// also sanitize the root element itself
		const rootComputed = getComputedStyle(el);
		if (rootComputed.color) el.style.color = rootComputed.color;
		if (rootComputed.backgroundColor) el.style.backgroundColor = rootComputed.backgroundColor;
		if (rootComputed.borderColor) el.style.borderColor = rootComputed.borderColor;
	};

	sanitizeColors(element);

	// --- CAPTURE ELEMENT ---
	const canvas = await html2canvas(element, {
		scale: 2,
		useCORS: true,
	});

	const imgData = canvas.toDataURL('image/png');

	// --- CREATE PDF ---
	const pdf = new jsPDF('p', 'mm', 'a4');
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();

	const imgWidth = pageWidth;
	const imgHeight = (canvas.height * imgWidth) / canvas.width;

	let heightLeft = imgHeight;
	let position = 0;

	// First page
	pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
	heightLeft -= pageHeight;

	// Additional pages
	while (heightLeft > 0) {
		position = heightLeft - imgHeight;
		pdf.addPage();
		pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
		heightLeft -= pageHeight;
	}

	// --- DOWNLOAD OR PREVIEW ---
	if (preview) {
		const blobUrl = pdf.output('bloburl');
		window.open(blobUrl, '_blank');
	} else {
		pdf.save(filename);
	}
}

export async function testHtml2Canvas(elementId) {
	const element = document.getElementById(elementId);
	if (!element) {
		console.error('Element not found:', elementId);
		return;
	}

	const canvas = await html2canvas(element, { scale: 2, logging: true });
	document.body.appendChild(canvas); // append to see what was captured
}
