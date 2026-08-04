import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function sanitiseComputedColors(element) {
	const nodes = [element, ...element.querySelectorAll('*')];

	nodes.forEach((node) => {
		const computed = getComputedStyle(node);
		node.style.color = computed.color;
		node.style.backgroundColor = computed.backgroundColor;
		node.style.borderColor = computed.borderColor;
	});
}

export async function exportSchedulePdf({
	rootElement,
	filename,
	orientation = 'portrait',
}) {
	if (!rootElement) {
		throw new Error('Export root element was not found.');
	}

	const pages = Array.from(rootElement.querySelectorAll('[data-export-page]'));
	const targets = pages.length > 0 ? pages : [rootElement];
	const pdf = new jsPDF(orientation === 'landscape' ? 'l' : 'p', 'mm', 'a4');
	const pageWidth = pdf.internal.pageSize.getWidth();
	const pageHeight = pdf.internal.pageSize.getHeight();

	for (let index = 0; index < targets.length; index += 1) {
		const page = targets[index];
		sanitiseComputedColors(page);

		const canvas = await html2canvas(page, {
			scale: 2,
			useCORS: true,
			backgroundColor: '#ffffff',
		});

		const imageData = canvas.toDataURL('image/png');
		const imageWidth = pageWidth;
		const imageHeight = (canvas.height * imageWidth) / canvas.width;
		const renderHeight = Math.min(pageHeight, imageHeight);
		const yOffset = Math.max(0, (pageHeight - renderHeight) / 2);

		if (index > 0) {
			pdf.addPage();
		}

		pdf.addImage(imageData, 'PNG', 0, yOffset, imageWidth, renderHeight);
	}

	pdf.save(filename);
}
