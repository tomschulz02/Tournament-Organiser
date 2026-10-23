import { useState, useRef, useEffect } from 'react';
import { ConfirmContext } from './ConfirmContext';
import '../App.css';

// confirm(message, { title, confirmLabel, cancelLabel, danger, requireText })
// resolves true or false. Buttons are named for the action ("Delete tournament"
// / "Keep it") rather than Yes/No, so the choice reads correctly without the
// question. `danger` marks an action that loses something: the confirm button
// turns red and focus starts on the safe choice, so Enter alone cannot destroy
// anything. `requireText` goes further for what cannot be undone: the confirm
// button stays disabled until that exact text is typed.
export const ConfirmProvider = ({ children }) => {
	const [options, setOptions] = useState(null);
	const resolver = useRef(null);
	const count = useRef(0);

	const confirm = (
		message,
		{ title = null, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, requireText = null } = {},
	) => {
		// A second confirm while one is open would orphan the first promise, and
		// its caller would wait forever. Answer it "no" instead.
		resolver.current?.(false);
		count.current += 1;
		setOptions({ id: count.current, message, title, confirmLabel, cancelLabel, danger, requireText });
		return new Promise((resolve) => {
			resolver.current = resolve;
		});
	};

	const handleResult = (result) => {
		const resolve = resolver.current;
		resolver.current = null;
		setOptions(null);
		setTimeout(() => resolve?.(result), 0);
	};

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{/* Keyed per request, so a replaced confirm starts with an empty input. */}
			{options && <ConfirmModal key={options.id} options={options} onResult={handleResult} />}
		</ConfirmContext.Provider>
	);
};

function ConfirmModal({ options, onResult }) {
	const { message, title, confirmLabel, cancelLabel, danger, requireText } = options;
	const [typed, setTyped] = useState('');
	const modalRef = useRef(null);
	const inputRef = useRef(null);
	const confirmRef = useRef(null);
	const cancelRef = useRef(null);

	// Surrounding spaces are forgiven; anything else must match exactly.
	const textMatches = !requireText || typed.trim() === requireText.trim();

	// Focus moves in on open and goes back on close, so a dialog this was asked
	// from (the score dialog, the schedule maker) keeps working by keyboard —
	// Escape there needs focus inside it.
	useEffect(() => {
		const previous = document.activeElement;
		(requireText ? inputRef : danger ? cancelRef : confirmRef).current?.focus();
		return () => {
			if (previous instanceof HTMLElement) previous.focus();
		};
	}, [danger, requireText]);

	// Escape answers no. Tab cycles through what can take focus here, so focus
	// cannot wander to the page behind the backdrop. stopPropagation keeps
	// Escape from also closing whatever opened this.
	const handleKeyDown = (event) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onResult(false);
			return;
		}
		if (event.key !== 'Tab' || !modalRef.current) return;

		event.preventDefault();
		const items = [...modalRef.current.querySelectorAll('input, button:not(:disabled)')];
		const index = items.indexOf(document.activeElement);
		const step = event.shiftKey ? -1 : 1;
		items[(index + step + items.length) % items.length]?.focus();
	};

	// Enter in the input confirms, once the text matches.
	const handleSubmit = (event) => {
		event.preventDefault();
		if (textMatches) onResult(true);
	};

	return (
		<div className="confirm-backdrop">
			<div
				ref={modalRef}
				className="confirm-modal"
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={title ? 'confirm-title' : undefined}
				aria-describedby="confirm-message"
				onKeyDown={handleKeyDown}>
				{title && (
					<h3 id="confirm-title" className="confirm-title">
						{title}
					</h3>
				)}
				<p id="confirm-message">{message}</p>
				<form onSubmit={handleSubmit}>
					{requireText && (
						<label className="confirm-require">
							<span>
								Type <strong>{requireText}</strong> to confirm.
							</span>
							<input
								ref={inputRef}
								type="text"
								value={typed}
								autoComplete="off"
								spellCheck={false}
								onChange={(event) => setTyped(event.target.value)}
							/>
						</label>
					)}
					<div className="confirm-buttons">
						<button
							ref={confirmRef}
							type="submit"
							className={danger ? 'confirm-danger' : undefined}
							disabled={!textMatches}>
							{confirmLabel}
						</button>
						<button ref={cancelRef} type="button" onClick={() => onResult(false)}>
							{cancelLabel}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
