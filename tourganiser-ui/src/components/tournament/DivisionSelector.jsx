import { useLayoutEffect, useRef, useState } from 'react';

// Beyond this many divisions a pill row stops being scannable regardless of how
// much room it has, so the count decides on its own before width is consulted.
const MAX_PILL_COUNT = 4;

// Picks a division for Standings and Teams. Pills when there are few and they
// fit, a dropdown when there are many or the row would not fit.
//
// The choice is made here rather than by the caller: both call sites want the
// same rule, and it depends on the rendered width, which only this component
// knows. Selection is local state in the caller — it changes the section, never
// the page, so it is deliberately not in the URL.
export default function DivisionSelector({ divisions = [], selectedId, onSelect, label = 'Division' }) {
	const containerRef = useRef(null);
	const measureRef = useRef(null);

	// Width alone. The count rule is applied during render below, so it can never
	// go stale against the current props.
	const [fits, setFits] = useState(true);

	// The first measurement is taken here rather than left to the observer below.
	// An observer's first callback is asynchronous and is throttled or dropped
	// while the page is not compositing, so depending on it for the initial
	// decision can leave the component showing pills that do not fit. A layout
	// effect always runs, and measuring the DOM then storing the result is what it
	// is for — there is nothing to measure until after the commit.
	useLayoutEffect(() => {
		const container = containerRef.current;
		const measure = measureRef.current;
		// Null whenever the component rendered nothing, which it does for fewer
		// than two divisions.
		if (!container || !measure) return;

		const measureFit = () => setFits(measure.scrollWidth <= container.clientWidth);

		measureFit();

		// Subsequent changes. An observer rather than a window resize listener
		// because the container can be resized without the viewport changing — a
		// sibling panel opening, for instance.
		const observer = new ResizeObserver(measureFit);
		observer.observe(container);
		observer.observe(measure);

		return () => observer.disconnect();
		// Re-measures when the divisions change, since their names set the width.
	}, [divisions]);

	// One division needs no selector — the section already names it. Zero needs
	// even less.
	if (divisions.length < 2) return null;

	const useDropdown = divisions.length > MAX_PILL_COUNT || !fits;

	return (
		<div className="tv-division-selector" ref={containerRef}>
			{/* Always rendered and never visible: the pill row cannot be measured
			    once it has been replaced by a dropdown, which would leave the
			    component unable to switch back on a widening viewport. Taken out of
			    flow so it contributes nothing to the container's own width. */}
			<div className="tv-division-measure" ref={measureRef} aria-hidden="true">
				<span className="tv-division-selector-label">{label}</span>
				{divisions.map((division) => (
					<span key={division.id} className="tv-division-pill">
						{division.name}
					</span>
				))}
			</div>

			{useDropdown ? (
				<label className="tv-division-dropdown">
					<span className="tv-division-selector-label">{label}</span>
					<select value={selectedId || ''} onChange={(event) => onSelect(event.target.value)}>
						{divisions.map((division) => (
							<option key={division.id} value={division.id}>
								{division.name}
							</option>
						))}
					</select>
				</label>
			) : (
				<div className="tv-division-pills">
					<span className="tv-division-selector-label">{label}</span>
					{divisions.map((division) => (
						<button
							key={division.id}
							type="button"
							className={`tv-division-pill ${division.id === selectedId ? 'active' : ''}`}
							aria-pressed={division.id === selectedId}
							onClick={() => onSelect(division.id)}>
							{division.name}
						</button>
					))}
				</div>
			)}
		</div>
	);
}
