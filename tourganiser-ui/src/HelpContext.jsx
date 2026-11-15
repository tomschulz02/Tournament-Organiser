import { createContext, useContext, useEffect } from "react";

export const HelpContext = createContext();

// { activeTopic, registerTopic, openHelp(topicId?, sectionId?), closeHelp,
//   helpRequest } — helpRequest is null while the help modal is closed.
export const useHelp = () => useContext(HelpContext);

// A component registers its own topic on mount and drops it on unmount, so the
// most recently mounted one — a tab or stage nested inside a page — wins over
// its parent, the same way a nested route overrides a parent's document title.
export function useHelpTopic(topicId) {
	const { registerTopic } = useHelp();

	useEffect(() => {
		if (!topicId) return;

		return registerTopic(topicId);
	}, [topicId, registerTopic]);
}
