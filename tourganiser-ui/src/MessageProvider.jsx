import { useCallback, useRef, useState } from "react";
import {MessageContext, useMessage} from './MessageContext';

export function MessageProvider({ children }) {
    const [message, setMessage] = useState(null);
    const timer = useRef(null);

    // A new message replaces the old one and gets its own full timeout. The
    // previous timer is cleared, or it would cut the new message short.
    //
    // Stable across renders, because effects list it as a dependency: a new
    // function on every render re-ran them after every message — Browse
    // refetched its list each time one was shown.
    const showMessage = useCallback((msg, type = "info", timeout = 3000) => {
        clearTimeout(timer.current);
        setMessage({ msg, type });
        timer.current = setTimeout(() => setMessage(null), timeout);
    }, []);

    return <MessageContext.Provider value={{ message, showMessage }}>{children}</MessageContext.Provider>;
}

export function MessagePopup() {
	const { message } = useMessage();

	if (!message) return null;

	return <div className={`message-popup ${message.type}`}>{message.msg}</div>;
}
