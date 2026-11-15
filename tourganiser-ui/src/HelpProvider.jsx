import { useCallback, useMemo, useState } from "react";
import { HelpContext } from './HelpContext';

export function HelpProvider({ children }) {
	const [topics, setTopics] = useState([]);
	// What the help modal was asked to show, or null while it is closed. A topic
	// of null means "whatever the page or modal on screen registered".
	const [request, setRequest] = useState(null);

	const registerTopic = useCallback((topicId) => {
		setTopics((previous) => [...previous, topicId]);

		return () => {
			setTopics((previous) => {
				const index = previous.lastIndexOf(topicId);
				if (index === -1) return previous;

				return [...previous.slice(0, index), ...previous.slice(index + 1)];
			});
		};
	}, []);

	// Any "?" button anywhere in the tree opens help here, at a topic and,
	// optionally, a section within it. See docs/handover-help-and-less-text.md.
	const openHelp = useCallback((topicId = null, sectionId = null) => {
		setRequest({ topicId, sectionId });
	}, []);

	const closeHelp = useCallback(() => setRequest(null), []);

	const activeTopic = topics.length > 0 ? topics[topics.length - 1] : null;

	const value = useMemo(
		() => ({ activeTopic, registerTopic, openHelp, closeHelp, helpRequest: request }),
		[activeTopic, registerTopic, openHelp, closeHelp, request]
	);

	return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}
