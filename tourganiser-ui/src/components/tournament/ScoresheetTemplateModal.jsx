import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import CreateModal from '../create/CreateModal';
import Icon from '../Icons';
import LoadingScreen from '../LoadingScreen';
import { useMessage } from '../../MessageContext';
import { useHelpTopic } from '../../HelpContext';
import { FIELD_LABELS, SCORESHEET_FIELDS, SYSTEM_TEMPLATES } from '../../utils/scoresheetTemplates';
import { listTemplates, saveTemplate } from '../../utils/scoresheetStorage';
import '../../styles/scoresheet-template.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// The `key` on each in-progress marker is local to the editor — for React
// list identity and for targeting one placement with the delete button — and
// is stripped before the record is saved or exported. A field can carry any
// number of markers, including zero: nothing requires every field to be
// placed, and a field like a team name may legitimately appear more than
// once on the same sheet.
function withoutKey(marker) {
	const { field, page, xRatio, yRatio, widthRatio, heightRatio } = marker;
	return { field, page, xRatio, yRatio, widthRatio, heightRatio };
}

// Picker, plus the upload-and-place flow for a new custom template. Follows
// DivisionModal's convention: one component, its own local draft state, and
// onCancel/onSave as the only way out. See docs/handover-scoresheets.md.
export default function ScoresheetTemplateModal({ initialTemplateKey = null, onCancel, onSave }) {
	useHelpTopic('scoresheet-template-modal');

	const { showMessage } = useMessage();
	const [screen, setScreen] = useState('picker');
	const [selectedKey, setSelectedKey] = useState(initialTemplateKey);
	const [customTemplates, setCustomTemplates] = useState([]);
	const [loadingCustom, setLoadingCustom] = useState(true);

	useEffect(() => {
		let active = true;

		listTemplates().then((templates) => {
			if (active) {
				setCustomTemplates(templates);
				setLoadingCustom(false);
			}
		});

		return () => {
			active = false;
		};
	}, []);

	// Upload setup: name and file, chosen before placement starts.
	const [uploadName, setUploadName] = useState('');
	const [uploadFile, setUploadFile] = useState(null);
	const [preparing, setPreparing] = useState(false);

	// The in-progress placement draft, created once the upload file is read.
	const [placingDraft, setPlacingDraft] = useState(null);
	const [pdfDoc, setPdfDoc] = useState(null);

	const handlePickFile = (event) => {
		const file = event.target.files?.[0] || null;
		setUploadFile(file);
		if (file && !uploadName.trim()) {
			setUploadName(file.name.replace(/\.pdf$/i, ''));
		}
	};

	// Shared by a fresh upload and re-opening a stored template for editing —
	// both need a pdfjs document to render from and the per-page sizes used to
	// convert a drawn box to a ratio.
	const loadPdfDoc = async (bytes) => {
		const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;

		const pageSize = [];
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
			const page = await pdf.getPage(pageNumber);
			const viewport = page.getViewport({ scale: 1 });
			pageSize.push({ width: viewport.width, height: viewport.height });
		}

		return { pdf, pageSize };
	};

	const startPlacing = async () => {
		if (!uploadFile) return;

		setPreparing(true);
		try {
			const originalBytes = await uploadFile.arrayBuffer();
			const { pdf, pageSize } = await loadPdfDoc(originalBytes);
			setPdfDoc(pdf);

			setPlacingDraft({
				name: uploadName.trim() || uploadFile.name,
				pdfBytes: originalBytes,
				pageCount: pdf.numPages,
				pageSize,
				fields: [],
				currentPage: 0,
				activeField: SCORESHEET_FIELDS[0],
			});
			setScreen('placing');
		} catch {
			showMessage('That file could not be read as a PDF.', 'error');
		} finally {
			setPreparing(false);
		}
	};

	// Re-opens an existing custom template's stored record in the same
	// placement screen the upload flow uses. The record's fields have no
	// `key` (stripped by withoutKey on save) — a fresh one is added here, the
	// same way placeMarker adds one when a marker is first placed.
	const startEditing = async (template) => {
		setPreparing(true);
		try {
			const { pdf, pageSize } = await loadPdfDoc(template.pdfBytes);
			setPdfDoc(pdf);

			setPlacingDraft({
				id: template.id,
				name: template.name,
				pdfBytes: template.pdfBytes,
				pageCount: template.pageCount,
				pageSize,
				fields: template.fields.map((marker) => ({ ...marker, key: crypto.randomUUID() })),
				currentPage: 0,
				activeField: SCORESHEET_FIELDS[0],
			});
			setScreen('placing');
		} catch {
			showMessage('That template could not be reopened for editing.', 'error');
		} finally {
			setPreparing(false);
		}
	};

	// Appends a new marker for `field` rather than replacing one — a field can
	// carry several. The active field never changes here: placing a box stays
	// on the same field so another location for it can be dragged straight
	// away, and switching to a different field is always a deliberate choice
	// made in the fields panel.
	const placeMarker = (field, page, xRatio, yRatio, widthRatio, heightRatio) => {
		setPlacingDraft((previous) => ({
			...previous,
			fields: [...previous.fields, { key: crypto.randomUUID(), field, page, xRatio, yRatio, widthRatio, heightRatio }],
		}));
	};

	const removeMarker = (key) => {
		setPlacingDraft((previous) => ({ ...previous, fields: previous.fields.filter((marker) => marker.key !== key) }));
	};

	const handleCopyFieldsJson = async () => {
		try {
			await navigator.clipboard.writeText(JSON.stringify(placingDraft.fields.map(withoutKey), null, 4));
			showMessage('Field coordinates copied as JSON.', 'success');
		} catch {
			showMessage('Could not copy to the clipboard.', 'error');
		}
	};

	const handleSaveCustomTemplate = async () => {
		const isEditing = Boolean(placingDraft.id);
		const id = placingDraft.id || crypto.randomUUID();
		const record = {
			id,
			name: placingDraft.name,
			pdfBytes: placingDraft.pdfBytes,
			pageCount: placingDraft.pageCount,
			pageSize: placingDraft.pageSize,
			fields: placingDraft.fields.map(withoutKey),
		};

		const saved = await saveTemplate(record);
		if (!saved) {
			showMessage('This template could not be saved to this browser.', 'error');
			return;
		}

		setCustomTemplates((previous) =>
			isEditing ? previous.map((template) => (template.id === id ? record : template)) : [...previous, record]
		);
		setSelectedKey(`custom:${id}`);
		setPlacingDraft(null);
		setPdfDoc(null);
		setUploadFile(null);
		setUploadName('');
		setScreen('picker');
		showMessage('Template saved.', 'success');
	};

	const cancelPlacing = () => {
		setPlacingDraft(null);
		setPdfDoc(null);
		setScreen('picker');
	};

	if (screen === 'placing' && placingDraft) {
		return (
			<CreateModal
				titleId="sst-modal-title"
				title="Place fields"
				subtitle={placingDraft.name}
				onClose={cancelPlacing}
				size="large"
				footer={
					<>
						<div className="ct-modal-footer-left">
							<button type="button" className="ct-button ct-button-quiet" onClick={handleCopyFieldsJson}>
								Copy fields as JSON
							</button>
						</div>
						<div className="ct-modal-footer-right">
							<button type="button" className="ct-button ct-button-quiet" onClick={cancelPlacing}>
								Cancel
							</button>
							<button type="button" className="ct-button ct-button-primary" onClick={handleSaveCustomTemplate}>
								Save template
							</button>
						</div>
					</>
				}>
				<FieldPlacementScreen
					draft={placingDraft}
					pdfDoc={pdfDoc}
					onChangeDraft={setPlacingDraft}
					onPlace={placeMarker}
					onRemove={removeMarker}
				/>
			</CreateModal>
		);
	}

	if (screen === 'upload') {
		return (
			<CreateModal
				titleId="sst-modal-title"
				title="Upload a template"
				subtitle="Choose the PDF to place fields on"
				onClose={() => setScreen('picker')}
				footer={
					<>
						<div className="ct-modal-footer-left">
							<button type="button" className="ct-button ct-button-quiet" onClick={() => setScreen('picker')}>
								Back
							</button>
						</div>
						<div className="ct-modal-footer-right">
							<button
								type="button"
								className="ct-button ct-button-primary"
								disabled={!uploadFile || preparing}
								onClick={startPlacing}>
								{preparing ? 'Reading…' : 'Continue'}
							</button>
						</div>
					</>
				}>
				<div className="sst-screen">
					<p className="sst-lede">
						Upload the PDF this template is printed from. You will draw a box for each field on the next screen.
					</p>

					<div className="ct-field">
						<label className="ct-field-label" htmlFor="sst-template-name">
							<span>Template name</span>
						</label>
						<input
							id="sst-template-name"
							className="ct-input"
							type="text"
							value={uploadName}
							onChange={(event) => setUploadName(event.target.value)}
							placeholder="Club scoresheet"
						/>
					</div>

					<div className="ct-field">
						<label className="ct-field-label" htmlFor="sst-template-file">
							<span>PDF file</span>
							<span className="ct-field-required">Required</span>
						</label>
						<input id="sst-template-file" type="file" accept="application/pdf" onChange={handlePickFile} />
					</div>
				</div>
			</CreateModal>
		);
	}

	return (
		<CreateModal
			titleId="sst-modal-title"
			title="Scoresheet template"
			subtitle="Choose what prints when an organiser downloads a fixture's scoresheet"
			onClose={onCancel}
			footer={
				<>
					<div className="ct-modal-footer-left" />
					<div className="ct-modal-footer-right">
						<button type="button" className="ct-button ct-button-quiet" onClick={onCancel}>
							Cancel
						</button>
						<button type="button" className="ct-button ct-button-primary" onClick={() => onSave(selectedKey)}>
							Save
						</button>
					</div>
				</>
			}>
			<div className="sst-screen">
				<div className="sst-option-list">
					<button
						type="button"
						className={`sst-option ${selectedKey === null ? 'sst-option-selected' : ''}`.trim()}
						aria-pressed={selectedKey === null}
						onClick={() => setSelectedKey(null)}>
						<div className="sst-option-body">
							<span className="sst-option-name">No template</span>
							<span className="sst-option-meta">Fixtures show no scoresheet download.</span>
						</div>
					</button>

					{SYSTEM_TEMPLATES.map((template) => (
						<button
							key={template.key}
							type="button"
							className={`sst-option ${selectedKey === template.key ? 'sst-option-selected' : ''}`.trim()}
							aria-pressed={selectedKey === template.key}
							onClick={() => setSelectedKey(template.key)}>
							<div className="sst-option-body">
								<span className="sst-option-name">{template.label}</span>
								<span className="sst-option-meta">Built in</span>
								{template.fields.length === 0 && (
									<span className="sst-option-warning">Not yet set up — no fields are placed.</span>
								)}
							</div>
						</button>
					))}

					{loadingCustom && (
						// Genuinely quick (an IndexedDB read, not a network request) — an
						// inline spinner beside static text, not the rotating fullPage
						// treatment a real wait gets.
						<p className="sst-lede sst-loading-row">
							<LoadingScreen variant="inline" /> Loading your custom templates…
						</p>
					)}

					{!loadingCustom &&
						customTemplates.map((template) => {
							const key = `custom:${template.id}`;
							// Distinct fields, not marker count — a field placed twice (a
							// second team-name location, say) still counts once here.
							const distinctFields = new Set(template.fields.map((marker) => marker.field)).size;

							return (
								<button
									key={key}
									type="button"
									className={`sst-option ${selectedKey === key ? 'sst-option-selected' : ''}`.trim()}
									aria-pressed={selectedKey === key}
									onClick={() => setSelectedKey(key)}>
									<div className="sst-option-body">
										<span className="sst-option-name">{template.name}</span>
										<span className="sst-option-meta">
											Custom upload · {distinctFields} of {SCORESHEET_FIELDS.length} fields placed
										</span>
										{distinctFields < SCORESHEET_FIELDS.length && (
											<span className="sst-option-warning">
												Some fields will never print on this template.
											</span>
										)}
									</div>
									<button
										type="button"
										className="sst-option-edit"
										title="Edit field placement"
										aria-label={`Edit field placement for ${template.name}`}
										onMouseDown={(event) => event.stopPropagation()}
										onClick={(event) => {
											event.stopPropagation();
											startEditing(template);
										}}>
										<Icon name="edit" size={16} />
									</button>
								</button>
							);
						})}
				</div>

				<button type="button" className="ct-button ct-button-quiet" onClick={() => setScreen('upload')}>
					Upload new template
				</button>

				<p className="sst-lede">
					A custom template is only usable on the device it was uploaded from. Other viewers see it is selected but
					cannot download it.
				</p>
			</div>
		</CreateModal>
	);
}

function FieldPlacementScreen({ draft, pdfDoc, onChangeDraft, onPlace, onRemove }) {
	const canvasRef = useRef(null);
	const [rendering, setRendering] = useState(true);

	// The render task is captured and cancelled on cleanup, not just flagged —
	// StrictMode mounts this effect twice in development, and without a real
	// cancel() the second render() call lands on the same canvas while the
	// first is still in flight. pdfjs rejects that outright ("Cannot use the
	// same canvas during multiple render() operations"), and an uncaught
	// rejection here left `rendering` stuck true forever, which silently
	// blocked every click on the canvas — the actual bug behind "can't place
	// any of the headers".
	useEffect(() => {
		if (!pdfDoc || !canvasRef.current) return undefined;

		let cancelled = false;
		let renderTask = null;

		setRendering(true);

		pdfDoc
			.getPage(draft.currentPage + 1)
			.then((page) => {
				if (cancelled) return undefined;

				const viewport = page.getViewport({ scale: 1.2 });
				const canvas = canvasRef.current;
				canvas.width = viewport.width;
				canvas.height = viewport.height;

				renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
				return renderTask.promise;
			})
			.then(() => {
				if (!cancelled) setRendering(false);
			})
			.catch((error) => {
				// A render task cancelled by the cleanup below rejects by design —
				// the render that superseded it is the one that resolves `rendering`.
				if (cancelled || error?.name === 'RenderingCancelledException') return;
				setRendering(false);
			});

		return () => {
			cancelled = true;
			renderTask?.cancel();
		};
	}, [pdfDoc, draft.currentPage]);

	// The box being dragged out, in canvas-pixel coordinates captured at
	// mousedown — null when nothing is being dragged. A drag is committed to
	// the active field on mouseup (or on the pointer leaving the canvas,
	// which finalizes at the last position inside it rather than losing the
	// drag entirely).
	const [drag, setDrag] = useState(null);

	const relativePoint = (event) => {
		const rect = canvasRef.current.getBoundingClientRect();
		return {
			x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
			y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
			rectWidth: rect.width,
			rectHeight: rect.height,
		};
	};

	const handleMouseDown = (event) => {
		if (!draft.activeField || rendering) return;

		const point = relativePoint(event);
		setDrag({ startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, ...point });
	};

	const handleMouseMove = (event) => {
		if (!drag) return;

		const point = relativePoint(event);
		setDrag((previous) => (previous ? { ...previous, currentX: point.x, currentY: point.y } : previous));
	};

	// A minimum drag distance, below which the gesture reads as a plain click
	// rather than a deliberate resize — that gets a sensible default-size box
	// anchored at the point, not a sliver a couple of pixels wide that nobody
	// could see or click again to redo.
	const MIN_DRAG_PX = 8;
	const DEFAULT_WIDTH_RATIO = 0.15;
	const DEFAULT_HEIGHT_RATIO = 0.035;

	const finalizeDrag = () => {
		if (!drag) return;

		const { startX, startY, currentX, currentY, rectWidth, rectHeight } = drag;
		setDrag(null);

		let left = Math.min(startX, currentX);
		let top = Math.min(startY, currentY);
		let boxWidth = Math.abs(currentX - startX);
		let boxHeight = Math.abs(currentY - startY);

		if (boxWidth < MIN_DRAG_PX || boxHeight < MIN_DRAG_PX) {
			left = startX;
			top = startY;
			boxWidth = DEFAULT_WIDTH_RATIO * rectWidth;
			boxHeight = DEFAULT_HEIGHT_RATIO * rectHeight;
		}

		onPlace(
			draft.activeField,
			draft.currentPage,
			left / rectWidth,
			top / rectHeight,
			boxWidth / rectWidth,
			boxHeight / rectHeight
		);
	};

	const markersOnThisPage = draft.fields.filter((marker) => marker.page === draft.currentPage);
	const distinctFieldsPlaced = new Set(draft.fields.map((marker) => marker.field)).size;

	const goToPage = (delta) => {
		onChangeDraft((previous) => ({
			...previous,
			currentPage: Math.min(Math.max(previous.currentPage + delta, 0), previous.pageCount - 1),
		}));
	};

	// The fields panel is a slide-in overlay rather than a permanent sidebar —
	// closed by default so the canvas has the room, especially on a narrow
	// screen, and opened on demand from the toggle below the lede. Selecting a
	// field there closes it again immediately, so the panel is never in the
	// way of the drag that follows.
	const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);

	const selectField = (field, page) => {
		onChangeDraft((previous) => ({ ...previous, activeField: field, currentPage: page ?? previous.currentPage }));
		setFieldsPanelOpen(false);
	};

	return (
		<div className="sst-screen sst-placing-screen">
			<p className="sst-lede sst-lede-wide">
				Click-drag a box on the page for the selected field — a quick click without dragging drops a default-size
				box you can redraw. A field can be placed more than once, and stays selected after each box so another
				location for it is a straight-away drag; open Fields below to place a different one. Text is sized and
				wrapped to fit each box when the scoresheet is generated.
			</p>

			<div className="sst-placer-area">
				<button type="button" className="sst-fields-toggle" onClick={() => setFieldsPanelOpen(true)}>
					<span className="sst-fields-toggle-label">
						Placing: <strong>{FIELD_LABELS[draft.activeField] || draft.activeField}</strong>
					</span>
					<span className="sst-fields-toggle-count">
						{distinctFieldsPlaced} of {SCORESHEET_FIELDS.length} fields placed — tap to change
					</span>
				</button>

				<div className="sst-canvas-scroll">
					<div
						className="sst-canvas-wrap"
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={finalizeDrag}
						onMouseLeave={finalizeDrag}>
						<canvas ref={canvasRef} />
						{markersOnThisPage.map((marker) => (
							<div
								key={marker.key}
								className={`sst-marker-box ${marker.field === draft.activeField ? 'sst-marker-box-active' : ''}`.trim()}
								style={{
									left: `${marker.xRatio * 100}%`,
									top: `${marker.yRatio * 100}%`,
									width: `${marker.widthRatio * 100}%`,
									height: `${marker.heightRatio * 100}%`,
								}}
								title={FIELD_LABELS[marker.field] || marker.field}>
								<span className="sst-marker-box-label">{FIELD_LABELS[marker.field] || marker.field}</span>
								<button
									type="button"
									className="sst-marker-box-remove"
									title={`Remove this ${FIELD_LABELS[marker.field] || marker.field} box`}
									aria-label={`Remove this ${FIELD_LABELS[marker.field] || marker.field} box`}
									onMouseDown={(event) => event.stopPropagation()}
									onClick={(event) => {
										event.stopPropagation();
										onRemove(marker.key);
									}}>
									×
								</button>
							</div>
						))}
						{drag && (
							<div
								className="sst-marker-preview"
								style={{
									left: `${(Math.min(drag.startX, drag.currentX) / drag.rectWidth) * 100}%`,
									top: `${(Math.min(drag.startY, drag.currentY) / drag.rectHeight) * 100}%`,
									width: `${(Math.abs(drag.currentX - drag.startX) / drag.rectWidth) * 100}%`,
									height: `${(Math.abs(drag.currentY - drag.startY) / drag.rectHeight) * 100}%`,
								}}
							/>
						)}
					</div>
				</div>

				{draft.pageCount > 1 && (
					<div className="sst-page-nav">
						<button
							type="button"
							className="ct-button ct-button-quiet"
							disabled={draft.currentPage === 0}
							onClick={() => goToPage(-1)}>
							<Icon name="leftChevron" size={16} />
							<span>Previous</span>
						</button>
						<span>
							Page {draft.currentPage + 1} of {draft.pageCount}
						</span>
						<button
							type="button"
							className="ct-button ct-button-quiet"
							disabled={draft.currentPage === draft.pageCount - 1}
							onClick={() => goToPage(1)}>
							<span>Next</span>
							<Icon name="arrowRight" size={16} />
						</button>
					</div>
				)}

				{/* Confined to this area, not the whole modal, so the slide-in
				    lands right where the reader was looking — over the canvas it
				    covers, not over the lede above it. Mirrors the site's help
				    menu: a dimmed backdrop click closes it same as the panel's
				    own close button. */}
				{fieldsPanelOpen && (
					<div className="sst-fields-overlay" onClick={() => setFieldsPanelOpen(false)}>
						<div className="sst-fields-panel" onClick={(event) => event.stopPropagation()}>
							<div className="sst-fields-panel-header">
								<h3>Fields</h3>
								<button
									type="button"
									className="sst-fields-panel-close"
									aria-label="Close"
									onClick={() => setFieldsPanelOpen(false)}>
									<Icon name="exit" size={18} />
								</button>
							</div>

							{/* One row per field in the fixed catalogue, not per marker —
							    a field with several boxes still gets one row, with a count. */}
							<div className="sst-field-list">
								{SCORESHEET_FIELDS.map((field) => {
									const markersForField = draft.fields.filter((marker) => marker.field === field);

									return (
										<button
											key={field}
											type="button"
											className={`sst-field-row ${field === draft.activeField ? 'sst-field-row-active' : ''} ${
												markersForField.length > 0 ? 'sst-field-row-placed' : ''
											}`.trim()}
											onClick={() => selectField(field, markersForField[0]?.page)}>
											<span>{FIELD_LABELS[field] || field}</span>
											<span className="sst-field-status">
												{markersForField.length > 0 ? markersForField.length : '—'}
											</span>
										</button>
									);
								})}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
