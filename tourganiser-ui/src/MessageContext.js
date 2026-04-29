import { createContext, useState, useContext } from "react";

const MessageContext = createContext();

export function MessageProvider({ children }) {
	const [message, setMessage] = useState(null);

	const showMessage = (msg, type = "info", timeout = 3000) => {
		setMessage({ msg, type });
		setTimeout(() => setMessage(null), timeout);
	};

	return <MessageContext.Provider value={{ message, showMessage }}>{children}</MessageContext.Provider>;
}

export const useMessage = () => useContext(MessageContext);

export function MessagePopup() {
	const { message } = useMessage();

	if (!message) return null;

	return <div className={`message-popup ${message.type}`}>{message.msg}</div>;
}
