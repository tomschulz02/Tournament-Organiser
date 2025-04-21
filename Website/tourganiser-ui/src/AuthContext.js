import { createContext, useState, useEffect } from "react";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	useEffect(() => {
		const token = true; // Replace with actual token check logic, i.e send api request to check if token is valid
		if (token) {
			setIsLoggedIn(true);
		}
	}, []);

	return <AuthContext.Provider value={{ isLoggedIn, setIsLoggedIn }}>{children}</AuthContext.Provider>;
}
