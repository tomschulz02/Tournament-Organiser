import { createContext, useState, useEffect, useRef } from "react";
import { checkLoginStatus } from "./requests";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [username, setUsername] = useState("Guest");
	const hasCheckedLogin = useRef(false);

	useEffect(() => {
		const checkLogin = async () => {
			try {
				const response = await checkLoginStatus();
				console.log("Login status response:", response); // Debugging line
				setIsLoggedIn(response.loggedIn);
				if (response.loggedIn) {
					setUsername(response.user);
				}
			} catch (error) {
				setIsLoggedIn(false);
			}
		};
		if (hasCheckedLogin.current) return;
		hasCheckedLogin.current = true;
		checkLogin();
	});

	return (
		<AuthContext.Provider value={{ isLoggedIn, setIsLoggedIn, username, setUsername }}>{children}</AuthContext.Provider>
	);
}
