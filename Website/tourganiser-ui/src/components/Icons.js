export default function Icon({ name, label = '', size = 24, className = '', onClick = () => {} }) {
	const icons = {
		doubleArrowDown: (
			<path d="M480-200 240-440l56-56 184 183 184-183 56 56-240 240Zm0-240L240-680l56-56 184 183 184-183 56 56-240 240Z" />
		),
		doubleArrowUp: (
			<path d="m296-224-56-56 240-240 240 240-56 56-184-183-184 183Zm0-240-56-56 240-240 240 240-56 56-184-183-184 183Z" />
		),
	};

	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 -960 960 960"
			width={size}
			height={size}
			className={className}
			role={label ? 'img' : 'presentation'}
			aria-label={label || undefined}
			aria-hidden={!label}
			onClick={onClick}>
			{icons[name]}
		</svg>
	);
}
