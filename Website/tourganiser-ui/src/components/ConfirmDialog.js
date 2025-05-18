import React, { useState, useRef, useEffect, createContext, useContext } from "react";
import "../styles/ConfirmDialog.css"; // Import your CSS file for styling

// Context to access confirm function globally
const ConfirmContext = createContext();

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }) => {
	const [options, setOptions] = useState(null);
	const resolver = useRef(null);

	const confirm = (message) => {
		setOptions({ message });
		return new Promise((resolve) => {
			resolver.current = resolve;
		});
	};

	const handleResult = (result) => {
		setOptions(null);
		setTimeout(() => {
			if (resolver.current) resolver.current(result);
		}, 0);
	};

	return (
		<ConfirmContext.Provider value={confirm}>
			{children}
			{options && (
				<div className="confirm-backdrop">
					<div className="confirm-modal">
						<p>{options.message}</p>
						<div className="confirm-buttons">
							<button onClick={() => handleResult(true)}>Yes</button>
							<button onClick={() => handleResult(false)}>No</button>
						</div>
					</div>
				</div>
			)}
		</ConfirmContext.Provider>
	);
};
