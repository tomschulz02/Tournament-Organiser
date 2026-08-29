import { useCallback, useState } from "react";
import { HelpContext } from './HelpContext';

export function HelpProvider({ children }) {
	const [topics, setTopics] = useState([]);

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

	const activeTopic = topics.length > 0 ? topics[topics.length - 1] : null;

	return <HelpContext.Provider value={{ activeTopic, registerTopic }}>{children}</HelpContext.Provider>;
}
