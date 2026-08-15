import { checkLoginStatus } from "./requests";
import { AuthContext } from "./AuthContext";
import { useEffect, useState, useRef } from "react";

export function AuthProvider({ children }) {
    const [isLoggedIn, setLoggedInState] = useState(false);
    const [username, setUsername] = useState("Guest");
    // Bumped only when the session actually changes — a logout, or a login or
    // signup that succeeds. Pages key their requests on it so that a session
    // change refetches whatever the server resolved from the cookie. isLoggedIn
    // itself cannot serve: it starts false and is resolved asynchronously on
    // mount, so every page load would look like a change.
    const [sessionVersion, setSessionVersion] = useState(0);
    const loggedInRef = useRef(false);
    const hasCheckedLogin = useRef(false);

    // Resolving the session that was already in place is not a change, so this
    // leaves the version alone. Only the mount check uses it.
    const resolveSession = (loggedIn) => {
        loggedInRef.current = loggedIn;
        setLoggedInState(loggedIn);
    };

    const setIsLoggedIn = (loggedIn) => {
        if (loggedInRef.current !== loggedIn) {
            setSessionVersion((version) => version + 1);
        }
        resolveSession(loggedIn);
    };

    useEffect(() => {
        const checkLogin = async () => {
            try {
                const { data } = await checkLoginStatus();
                resolveSession(data.loggedIn);
                if (data.loggedIn) {
                    setUsername(data.username);
                } else {
                    setUsername("Guest");
                }
            } catch {
                resolveSession(false);
            }
        };
        if (hasCheckedLogin.current) return;
        hasCheckedLogin.current = true;
        checkLogin();
    });

    return (
        <AuthContext.Provider value={{ isLoggedIn, setIsLoggedIn, username, setUsername, sessionVersion }}>{children}</AuthContext.Provider>
    );
}
