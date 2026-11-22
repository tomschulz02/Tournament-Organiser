import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../Icons';
import IconTooltip from '../IconTooltip';

// The Fixtures & Schedule toolbar's secondary actions (results export, print
// schedule, print all scoresheets), behind one "more" button so the toolbar keeps
// to one icon beside the main action.
//
// Each action is { id, label, icon, to } for a link opened in a new tab, or
// { id, label, icon, onClick, disabled, title } for a button. With a single
// action there is nothing to choose between, so it renders as that action's own
// icon button rather than a menu of one (decided 2026-11-21). With none, nothing.
//
// Dismissal matches the app's other menus (the schedule maker's overflow, the
// division colour picker): a pointerdown outside or Escape closes it.
export default function ToolbarMenu({ actions = [] }) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef(null);
	const toggleRef = useRef(null);
	const listRef = useRef(null);

	useEffect(() => {
		if (!open) return;

		const items = () => [...(listRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])];
		items()[0]?.focus();

		const onPointerDown = (event) => {
			if (!containerRef.current?.contains(event.target)) setOpen(false);
		};
		const onKeyDown = (event) => {
			if (event.key === 'Escape') {
				setOpen(false);
				toggleRef.current?.focus();
				return;
			}
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

			const list = items();
			if (list.length === 0) return;
			event.preventDefault();
			const at = list.indexOf(document.activeElement);
			const step = event.key === 'ArrowDown' ? 1 : -1;
			list[(at + step + list.length) % list.length].focus();
		};

		document.addEventListener('pointerdown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);

		return () => {
			document.removeEventListener('pointerdown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	if (actions.length === 0) return null;

	if (actions.length === 1) {
		const [action] = actions;
		return (
			<IconTooltip label={action.disabled && action.title ? action.title : action.label}>
				<ActionControl action={action} className="tv-icon-button tv-icon-button--icon" iconOnly />
			</IconTooltip>
		);
	}

	return (
		<div className="tv-toolbar-menu" ref={containerRef}>
			<IconTooltip label="More actions">
				<button
					ref={toggleRef}
					type="button"
					className="tv-icon-button tv-icon-button--icon"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-label="More actions"
					onClick={() => setOpen((value) => !value)}>
					<Icon name="more" size={20} fill="currentColor" />
				</button>
			</IconTooltip>

			{open && (
				<div className="tv-toolbar-menu-list" role="menu" aria-label="More actions" ref={listRef}>
					{actions.map((action) => (
						<ActionControl
							key={action.id}
							action={action}
							className="tv-toolbar-menu-item"
							role="menuitem"
							onDone={() => setOpen(false)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function ActionControl({ action, className, role, iconOnly = false, onDone }) {
	const icon = <Icon name={action.icon} size={20} fill="currentColor" />;
	const content = iconOnly ? icon : (
		<>
			{icon}
			<span>{action.label}</span>
		</>
	);

	if (action.to) {
		return (
			<Link
				to={action.to}
				className={className}
				role={role}
				target="_blank"
				rel="noopener"
				aria-label={iconOnly ? action.label : undefined}
				onClick={onDone}>
				{content}
			</Link>
		);
	}

	return (
		<button
			type="button"
			className={className}
			role={role}
			disabled={action.disabled}
			title={action.disabled ? action.title : undefined}
			aria-label={iconOnly ? action.label : undefined}
			onClick={() => {
				onDone?.();
				action.onClick?.();
			}}>
			{content}
		</button>
	);
}
