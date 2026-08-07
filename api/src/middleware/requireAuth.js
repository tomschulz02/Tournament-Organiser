// Rejects a request when no valid session is present.
//
// The global middleware in app.js only populates req.user; it never rejects.
// Apply this to any route that must not be reachable anonymously.

export function requireAuth(req, res, next) {
	if (!req.user) {
		return res.status(401).json({ error: "Authentication required" });
	}

	next();
}
