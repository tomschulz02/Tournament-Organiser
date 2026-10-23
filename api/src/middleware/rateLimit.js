import { rateLimit, MemoryStore } from "express-rate-limit";
import { AppError } from "../errors.js";

// Throttles the two endpoints where an unthrottled attacker gains something:
// signup and login. Everything else stays unlimited, because browsing and
// viewing a tournament are anonymous and legitimate — see docs/api.md.
//
// Ten attempts per minute per IP. A real person mistyping a password will not
// reach that; someone working through a password list will, immediately.
export const AUTH_WINDOW_MS = 60 * 1000;
export const AUTH_MAX_ATTEMPTS = 10;

// Held explicitly rather than left to the default so that tests can clear it
// between cases. Without that, one test file's login attempts would count
// towards the next test's budget and the suite's own requests would trip the
// limiter it is trying to exercise.
const store = new MemoryStore();

export const authLimiter = rateLimit({
    windowMs: AUTH_WINDOW_MS,
    limit: AUTH_MAX_ATTEMPTS,
    store,
    // RateLimit-* headers, not the obsolete X-RateLimit-* ones.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Hand the rejection to the error middleware rather than answering here, so
    // a 429 carries the same { success, message, data } envelope as every other
    // failure. The default responder would send a bare string.
    handler: (req, res, next) => next(new AppError("TOO_MANY_REQUESTS"))
});

// The editor suggestions. Typing fires one search per pause, so thirty a minute
// is far more than a person uses and far too few to sweep the username list.
// Keyed by user rather than IP: the route is signed-in only, and one person on a
// shared network should not spend everyone else's budget.
export const SEARCH_WINDOW_MS = 60 * 1000;
export const SEARCH_MAX_REQUESTS = 30;

const searchStore = new MemoryStore();

export const searchLimiter = rateLimit({
    windowMs: SEARCH_WINDOW_MS,
    limit: SEARCH_MAX_REQUESTS,
    store: searchStore,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Runs after requireAuth, so there is always a user.
    keyGenerator: (req) => req.user.id,
    handler: (req, res, next) => next(new AppError("TOO_MANY_REQUESTS"))
});

export function resetSearchLimiter() {
    searchStore.resetAll();
}

export function resetAuthLimiter() {
    store.resetAll();
}
