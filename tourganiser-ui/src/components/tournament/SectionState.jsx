// The three non-content states of a content area: loading, empty and error.
//
// One request feeds the whole page (handover A1), so an error here covers the
// whole content area rather than one section of it. The navigation above stays
// usable either way, which is the part that matters.

// Skeletons rather than a spinner. The shell is already on screen by the time
// this renders, and a spinner in the content area reads as the whole page
// reloading rather than one section filling in.
function LoadingState({ shape, count }) {
	return (
		<div className={`tv-skeleton-${shape === 'cards' ? 'cards' : 'rows'}`} aria-busy="true" aria-label="Loading">
			{Array.from({ length: count }, (_, index) => (
				<span key={index} className={`tv-skeleton tv-skeleton-${shape === 'cards' ? 'card' : 'row'}`} />
			))}
		</div>
	);
}

export default function SectionState({
	variant,
	title,
	message,
	onRetry,
	shape = 'rows',
	count = 3,
	children = null,
}) {
	if (variant === 'loading') {
		return <LoadingState shape={shape} count={count} />;
	}

	// The error variant says what failed and offers a way out. `message` is an
	// ApiError's message, which is display-ready by contract.
	if (variant === 'error') {
		return (
			<div className="tv-panel tv-panel-message" role="alert">
				<h2>{title || 'This section could not be loaded'}</h2>
				{message && <p>{message}</p>}
				{onRetry && (
					<button type="button" className="tv-retry" onClick={onRetry}>
						Retry
					</button>
				)}
			</div>
		);
	}

	// Empty. `children` is the slot for an organiser action — Add Team, Create
	// Schedule — and is simply absent for a viewer who is not the creator, so this
	// component never needs to know about permissions.
	return (
		<div className="tv-panel tv-panel-message">
			<h2>{title || 'Nothing here yet'}</h2>
			{message && <p>{message}</p>}
			{children}
		</div>
	);
}
