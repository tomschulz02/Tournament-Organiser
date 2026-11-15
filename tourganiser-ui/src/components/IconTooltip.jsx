import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// How long a mouse rests on a control before its name shows. Keyboard focus
// shows it at once.
const HOVER_DELAY_MS = 300;
// How long a finger holds a control before its name shows instead of the tap
// going through.
const LONG_PRESS_MS = 500;
// Space between the control and the tooltip, and the least distance kept from
// the edge of the viewport.
const GAP = 6;
const EDGE = 4;

// Shows the name of an icon-only control: after a short hover, on keyboard
// focus, and on a long-press on a touch screen, where a normal tap still acts.
// See docs/roadmap.md, "UI polish before release", item 4.
//
// The child keeps its own aria-label, which is its accessible name. The tooltip
// repeats those words for sighted users only, so it is aria-hidden and not
// linked by aria-describedby — otherwise a screen reader reads the name twice.
//
// Portalled to document.body at --z-tooltip so it paints above modals, and
// positioned against the control rather than the pointer.
export default function IconTooltip({ label, children }) {
	const [visible, setVisible] = useState(false);
	const anchorRef = useRef(null);
	const tipRef = useRef(null);
	const hoverTimer = useRef(null);
	const pressTimer = useRef(null);
	// Set when a long-press showed the tooltip, so the click the finger's
	// release produces is swallowed rather than running the action.
	const swallowClick = useRef(false);

	const clearTimers = () => {
		clearTimeout(hoverTimer.current);
		clearTimeout(pressTimer.current);
	};

	const hide = () => {
		clearTimers();
		setVisible(false);
	};

	useEffect(() => clearTimers, []);

	// Placed above the control, centred on it, and kept inside the viewport:
	// below it when there is no room above, and slid sideways near an edge.
	// Written straight onto the element, before paint: it is measured first, so
	// it renders hidden at the corner and is revealed here.
	useLayoutEffect(() => {
		const tipElement = tipRef.current;
		const anchor = anchorRef.current?.getBoundingClientRect();
		if (!visible || !tipElement || !anchor) return;

		const tip = tipElement.getBoundingClientRect();

		let top = anchor.top - tip.height - GAP;
		if (top < EDGE) top = anchor.bottom + GAP;

		const centred = anchor.left + anchor.width / 2 - tip.width / 2;
		const left = Math.min(Math.max(centred, EDGE), window.innerWidth - tip.width - EDGE);

		tipElement.style.top = `${top}px`;
		tipElement.style.left = `${left}px`;
		tipElement.style.visibility = 'visible';
	}, [visible, label]);

	// While it is up: Escape, any scroll, or a touch anywhere else puts it away.
	useEffect(() => {
		if (!visible) return undefined;

		const close = () => {
			clearTimeout(hoverTimer.current);
			clearTimeout(pressTimer.current);
			setVisible(false);
		};
		const onKeyDown = (event) => {
			if (event.key === 'Escape') close();
		};
		const onPointerDown = (event) => {
			if (!anchorRef.current?.contains(event.target)) close();
		};

		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('scroll', close, { capture: true, passive: true });

		return () => {
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('scroll', close, { capture: true });
		};
	}, [visible]);

	const handlePointerEnter = (event) => {
		if (event.pointerType === 'touch') return;
		clearTimeout(hoverTimer.current);
		hoverTimer.current = setTimeout(() => setVisible(true), HOVER_DELAY_MS);
	};

	const handlePointerLeave = (event) => {
		if (event.pointerType === 'touch') return;
		hide();
	};

	const handlePointerDown = (event) => {
		swallowClick.current = false;
		if (event.pointerType !== 'touch') return;

		clearTimeout(pressTimer.current);
		pressTimer.current = setTimeout(() => {
			swallowClick.current = true;
			setVisible(true);
		}, LONG_PRESS_MS);
	};

	const endPress = () => clearTimeout(pressTimer.current);

	const handleClickCapture = (event) => {
		if (!swallowClick.current) return;
		swallowClick.current = false;
		// preventDefault as well, for a <Link>: it would otherwise navigate.
		event.preventDefault();
		event.stopPropagation();
	};

	// :focus-visible only, so a mouse click (which also focuses a button) does
	// not pop the tooltip up straight after the action.
	const handleFocus = (event) => {
		if (event.target.matches?.(':focus-visible')) setVisible(true);
	};

	return (
		<>
			<span
				ref={anchorRef}
				className="icon-tooltip-anchor"
				onPointerEnter={handlePointerEnter}
				onPointerLeave={handlePointerLeave}
				onPointerDown={handlePointerDown}
				onPointerUp={endPress}
				onPointerCancel={endPress}
				onClickCapture={handleClickCapture}
				// A long-press on a link opens the browser's own menu on Android.
				onContextMenu={(event) => {
					if (swallowClick.current || visible) event.preventDefault();
				}}
				onFocus={handleFocus}
				onBlur={hide}>
				{children}
			</span>

			{visible &&
				createPortal(
					<div
						ref={tipRef}
						className="icon-tooltip"
						aria-hidden="true"
						style={{ top: 0, left: 0, visibility: 'hidden' }}>
						{label}
					</div>,
					document.body
				)}
		</>
	);
}
