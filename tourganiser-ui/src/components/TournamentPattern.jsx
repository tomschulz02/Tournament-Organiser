import { getTournamentIdentity } from '../utils/tournamentIdentity';

// The generated half of a tournament's visual identity — a handful of low-opacity
// geometric shapes, laid out from getTournamentIdentity(tournamentId). One
// component, reused wherever a tournament's identity is shown (the Browse card,
// the Overview header), so the whole application draws from one visual language
// rather than each page inventing its own decoration.
//
// Meant to be layered behind existing content: absolutely positioned by the
// caller's CSS, pointer-events: none here so it can never intercept a click, and
// currentColor so the caller controls the tint via `color`.
//
// viewBox is 0 0 100 100 — every coordinate from tournamentIdentity is already a
// percentage, so this never needs to know the element's rendered size. slice
// crops rather than squashes when the aspect ratio does not match, which is what
// "crop gracefully" means for a shape that has no natural aspect ratio of its own.
export default function TournamentPattern({ tournamentId, className = '' }) {
	if (!tournamentId) return null;

	const { pattern } = getTournamentIdentity(tournamentId);

	return (
		<svg
			className={`tournament-pattern ${className}`.trim()}
			viewBox="0 0 100 100"
			preserveAspectRatio="xMidYMid slice"
			aria-hidden="true"
			focusable="false">
			{renderMotif(pattern)}
		</svg>
	);
}

function renderMotif({ motif, elements }) {
	switch (motif) {
		case 'arcs':
			return elements.map((el, index) => (
				<circle
					key={index}
					cx={el.cx}
					cy={el.cy}
					r={el.size / 2}
					pathLength="100"
					strokeDasharray={`${18 + (index % 3) * 6} 100`}
					transform={`rotate(${el.rotation} ${el.cx} ${el.cy})`}
					fill="none"
					stroke="currentColor"
					strokeWidth="2.5"
					opacity={el.opacity}
				/>
			));

		case 'diagonal':
			return elements.map((el, index) => (
				<line
					key={index}
					x1={el.offset - 20}
					y1={-10}
					x2={el.offset + 20}
					y2={110}
					stroke="currentColor"
					strokeWidth={el.thickness}
					opacity={el.opacity}
				/>
			));

		case 'dots':
			return elements.map((el, index) => (
				<circle key={index} cx={el.cx} cy={el.cy} r={Math.max(2, el.size / 8)} fill="currentColor" opacity={el.opacity} />
			));

		case 'grid':
			return elements.map((el, index) =>
				index % 2 === 0 ? (
					<line key={index} x1={0} y1={el.offset} x2={100} y2={el.offset} stroke="currentColor" strokeWidth={el.thickness} opacity={el.opacity} />
				) : (
					<line key={index} x1={el.offset} y1={0} x2={el.offset} y2={100} stroke="currentColor" strokeWidth={el.thickness} opacity={el.opacity} />
				),
			);

		case 'circles':
		default:
			return elements.map((el, index) => (
				<circle
					key={index}
					cx={el.cx}
					cy={el.cy}
					r={el.size / 2}
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					opacity={el.opacity}
				/>
			));
	}
}
