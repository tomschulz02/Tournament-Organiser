import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icons';
import HelpButton from '../HelpButton';

// Everything inside the modal that can take focus. Used to keep Tab inside it,
// which aria-modal="true" claims and only a focus trap delivers.
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The shell this app's modals sit in: the creation page's two, score entry,
// the next round, the scoresheet template picker and the help.
//
// Portalled onto document.body. .modal-backdrop in App.css is z-index 5, while
// the site header is 1000 and the footer is 10 — a modal using the base class
// alone is painted under both and loses its top and bottom. .ct-modal-backdrop
// raises it to 1100, the same escape ScheduleMakerModal makes, and leaving the
// React tree means no ancestor can create a containing block for it.
//
// One shell rather than one per modal: the trap, the Escape handling and the
// scroll lock are the same three problems twice, and getting them subtly
// different in two places is how a modal ends up half-usable on a phone.
//
// `helpTopic` (and optionally `helpSection`) puts a "?" beside the close
// button that opens that help topic over the modal. `backdropClassName` lets a
// modal sit on another layer — the help does, so it opens above the others.
export default function CreateModal({
	titleId,
	title,
	subtitle,
	onClose,
	size = 'standard',
	children,
	footer,
	helpTopic,
	helpSection,
	backdropClassName = '',
}) {
	const modalRef = useRef(null);

	// Nest-safe: the help opens over another modal, and a second lock would
	// read scrollY as 0 (the body is already fixed) and, closing first, unlock
	// the page under a modal that is still open. So only the instance that took
	// the lock releases it.
	useEffect(() => {
		if (document.body.classList.contains('noscroll')) return undefined;

		const scrollY = window.scrollY;
		document.body.style.top = `-${scrollY}px`;
		document.body.classList.add('noscroll');
		return () => {
			document.body.classList.remove('noscroll');
			document.body.style.top = '';
			window.scrollTo(0, scrollY);
		};
	}, []);

	// Focus moves into the modal on open and back to whatever opened it on
	// close. Without this, Tab from an unfocused dialog walks the page behind it.
	useEffect(() => {
		const previouslyFocused = document.activeElement;
		// preventScroll: focusing the dialog must not scroll anything — it would
		// cut short the help modal's scroll to a section.
		modalRef.current?.focus({ preventScroll: true });

		return () => {
			if (previouslyFocused instanceof HTMLElement) {
				previouslyFocused.focus();
			}
		};
	}, []);

	const handleKeyDown = (event) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onClose();
			return;
		}

		if (event.key !== 'Tab' || !modalRef.current) return;

		// offsetParent is null for anything display:none, which keeps the screens
		// that are not currently showing out of the cycle.
		const items = [...modalRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node.offsetParent !== null);
		if (items.length === 0) return;

		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;

		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	};

	return createPortal(
		<div
			className={`modal-backdrop ct-modal-backdrop ${backdropClassName}`.trim()}
			role="presentation"
			onClick={onClose}
			onKeyDown={handleKeyDown}>
			<div
				className={`ct-modal ct-modal-${size}`}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				ref={modalRef}
				tabIndex={-1}
				onClick={(event) => event.stopPropagation()}>
				<div className="ct-modal-header">
					<div className="ct-modal-heading">
						<h2 id={titleId}>{title}</h2>
						{subtitle && <p className="ct-modal-subtitle">{subtitle}</p>}
					</div>
					{helpTopic && <HelpButton topic={helpTopic} section={helpSection} className="ct-modal-help" />}
					<button type="button" className="ct-modal-close" onClick={onClose} aria-label="Close">
						<Icon name="exit" size={20} />
					</button>
				</div>

				<div className="ct-modal-body">{children}</div>

				{footer && <div className="ct-modal-footer">{footer}</div>}
			</div>
		</div>,
		document.body
	);
}
