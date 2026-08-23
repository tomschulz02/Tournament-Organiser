import { useId, useState } from 'react';

// A collapsible heading for a group of fixtures, shared by the two states of
// Fixtures & Schedule: ScheduleTab's per-day (and "Not yet scheduled") sections
// and FixturesTab's per-status groups. The interaction mirrors Browse.jsx's
// tournament groups — a button header with aria-expanded and a chevron that
// rotates on expand — but not its look: no bordered card wraps the group, per
// the roadmap's "no surrounding borders".
//
// State lives here because collapse is a purely local view preference; there is
// nothing to lift or persist.
export default function FixtureGroup({ title, meta, defaultExpanded = true, children }) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const contentId = useId();

	return (
		<section className="tv-fixture-group">
			<button
				type="button"
				className={`tv-fixture-group-heading ${expanded ? 'expanded' : ''}`}
				aria-expanded={expanded}
				aria-controls={contentId}
				onClick={() => setExpanded((prev) => !prev)}>
				<svg
					className="tv-fixture-group-chevron"
					xmlns="http://www.w3.org/2000/svg"
					height="20"
					viewBox="0 -960 960 960"
					width="20"
					aria-hidden="true">
					<path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
				</svg>
				<span className="tv-fixture-group-title">{title}</span>
				{meta != null && <span className="tv-fixture-group-meta">{meta}</span>}
			</button>

			{expanded && (
				<div id={contentId} className="tv-fixture-group-content">
					{children}
				</div>
			)}
		</section>
	);
}
