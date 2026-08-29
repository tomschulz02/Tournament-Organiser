import { useState } from "react";
import {MessageContext, useMessage} from './MessageContext';

export function MessageProvider({ children }) {
    const [message, setMessage] = useState(null);

    const showMessage = (msg, type = "info", timeout = 3000) => {
        setMessage({ msg, type });
        setTimeout(() => setMessage(null), timeout);
    };

    return <MessageContext.Provider value={{ message, showMessage }}>{children}</MessageContext.Provider>;
}

export function MessagePopup() {
	const { message } = useMessage();

	if (!message) return null;

	return <div className={`message-popup ${message.type}`}>{message.msg}</div>;
}
