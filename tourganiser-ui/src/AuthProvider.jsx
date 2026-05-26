import { checkLoginStatus } from "./requests";
import { AuthContext } from "./AuthContext";
import { useEffect, useState, useRef } from "react";

export function AuthProvider({ children }) {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [username, setUsername] = useState("Guest");
    const hasCheckedLogin = useRef(false);

    useEffect(() => {
        const checkLogin = async () => {
            try {
                const response = await checkLoginStatus();
                setIsLoggedIn(response.loggedIn);
                if (response.loggedIn) {
                    setUsername(response.user);
                } else {
                    setUsername("Guest");
                    setIsLoggedIn(false);
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