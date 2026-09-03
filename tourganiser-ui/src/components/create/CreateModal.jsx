import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icons';

// Everything inside the modal that can take focus. Used to keep Tab inside it,
// which aria-modal="true" claims and only a focus trap delivers.
const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The shell both of this page's modals sit in.
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
export default function CreateModal({ titleId, title, subtitle, onClose, size = 'standard', children, footer }) {
	const modalRef = useRef(null);

	useEffect(() => {
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
		modalRef.current?.focus();

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
		<div className="modal-backdrop ct-modal-backdrop" role="presentation" onClick={onClose} onKeyDown={handleKeyDown}>
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
