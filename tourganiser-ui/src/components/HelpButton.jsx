import Icon from './Icons';
import IconTooltip from './IconTooltip';
import { useHelp } from '../HelpContext';
import { HELP_TOPICS } from '../helpContent';

// The "?" that replaces an on-screen explanation: it opens the help at a topic
// and, optionally, a section within it. Always the icon, never question text —
// see docs/decisions.md, "Help Is A Modal Of Topics".
//
// Its name says what it explains: the section's heading when there is one,
// otherwise the topic's title. Never place it inside another button (an
// accordion header, a selectable card): a button cannot hold a button.
export default function HelpButton({ topic, section = null, className = '' }) {
	const { openHelp } = useHelp();
	const entry = HELP_TOPICS[topic];
	const heading = section ? entry?.sections.find((candidate) => candidate.id === section)?.heading : null;
	const label = `Help: ${heading ?? entry?.title ?? 'Help'}`;

	return (
		<IconTooltip label={label}>
			<button
				type="button"
				className={`help-inline-button ${className}`.trim()}
				aria-label={label}
				onClick={(event) => {
					// Inside a modal's backdrop, a click must not reach the backdrop
					// and close the modal underneath.
					event.stopPropagation();
					openHelp(topic, section);
				}}>
				<Icon name="help" size={20} fill="currentColor" />
			</button>
		</IconTooltip>
	);
}
