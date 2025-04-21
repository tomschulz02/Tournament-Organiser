import { createContext, useState, useEffect } from "react";
import { checkLoginStatus } from "./requests";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
	const [isLoggedIn, setIsLoggedIn] = useState(false);

	useEffect(() => {
		const checkLogin = async () => {
			try {
				const response = await checkLoginStatus();
				setIsLoggedIn(response.loggedIn);
			} catch (error) {
				setIsLoggedIn(false);
			}
		};
		checkLogin();
	}, []);

	return <AuthContext.Provider value={{ isLoggedIn, setIsLoggedIn }}>{children}</AuthContext.Provider>;
}
