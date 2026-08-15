// Single source of truth for session lifetime.
// The JWT expiry and the cookie maxAge must always agree, otherwise the session
// silently ends at whichever is shorter.

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SESSION_TTL_JWT = "24h";

// Cookie options shared by login, signup and logout. Logout must clear the cookie
// with the same flags it was set with, or the browser keeps it.
export function sessionCookieOptions() {
	const isProduction = process.env.NODE_ENV === "production";

	return {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "none" : "lax",
		path: "/",
	};
}
