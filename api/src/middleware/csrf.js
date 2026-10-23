import { AppError } from "../errors.js";

// Cross-site request forgery protection. The session is a cookie, and in
// production that cookie is SameSite=None (config/auth.js), so the browser
// attaches it to a request any other site makes — a hidden form that submits
// itself, for instance. This is what stops such a request reaching a route.
//
// Two checks, each enough on its own against a form:
//
//   Origin   — a write must come from the frontend. Every current browser sends
//              Origin on a cross-origin POST, PUT or DELETE, so a request
//              WITHOUT one is not a browser acting for a victim: it is curl, a
//              script or the test suite, none of which hold anyone's cookie. It
//              is let through. `null`, which a sandboxed frame or a
//              no-referrer page sends, is an origin like any other and is
//              refused because it is not on the list.
//
//   JSON     — the API takes nothing else. A form can only send urlencoded,
//              multipart or text/plain, and a page cannot send application/json
//              cross-origin without a preflight, which CORS refuses. A write with
//              no body and no Content-Type is accepted: that is how
//              tourganiser-ui/src/requests.js sends start, end, save, delete and
//              logout.
//
// Mounted after cors(), so a preflight is answered before it gets here and a
// rejection sent to the real frontend carries the headers it needs to read it.
// See docs/api.md, "Security".

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function rejectCrossOriginWrites(allowedOrigins) {
    const allowed = new Set(allowedOrigins);

    return (req, res, next) => {
        if (SAFE_METHODS.has(req.method)) {
            return next();
        }

        const origin = req.headers.origin;
        if (origin !== undefined && !allowed.has(origin)) {
            return next(new AppError("CROSS_ORIGIN_REQUEST"));
        }

        const contentType = req.headers["content-type"];
        const acceptable = contentType === undefined ? !hasBody(req) : mediaType(contentType) === "application/json";
        if (!acceptable) {
            return next(new AppError("UNSUPPORTED_MEDIA_TYPE"));
        }

        return next();
    };
}

// The same test body-parser makes, except that an explicit Content-Length of 0
// counts as no body: a bodiless fetch sends exactly that.
function hasBody(req) {
    return req.headers["transfer-encoding"] !== undefined || Number(req.headers["content-length"]) > 0;
}

// "application/json; charset=utf-8" -> "application/json". Media types are
// case-insensitive.
function mediaType(contentType) {
    return contentType.split(";")[0].trim().toLowerCase();
}
