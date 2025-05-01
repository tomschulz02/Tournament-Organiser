import { createContext, useState, useEffect, useRef } from "react";
import { checkLoginStatus } from "./requests";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const hasCheckedLogin = useRef(false);

	useEffect(() => {
		const checkLogin = async () => {
			try {
				const response = await checkLoginStatus();
				setIsLoggedIn(response.loggedIn);
			} catch (error) {
				setIsLoggedIn(false);
			}
		};
		if (hasCheckedLogin.current) return;
		hasCheckedLogin.current = true;
		checkLogin();
	}, []);

	return <AuthContext.Provider value={{ isLoggedIn, setIsLoggedIn }}>{children}</AuthContext.Provider>;
}
