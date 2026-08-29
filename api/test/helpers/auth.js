import jwt from "jsonwebtoken";

// Builds the Cookie header the session middleware in src/app.js expects.
// Signed with the same JWT_SECRET that test/setup.js installs.
export function authCookie(payload = { id: "user-1", username: "tom", email: "tom@example.com", admin: false }, options = {}) {
    return `token=${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "24h", ...options })}`;
}

export function expiredAuthCookie(payload = { id: "user-1", username: "tom" }) {
    return `token=${jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: -10 })}`;
}

export function cookieSignedWithWrongSecret(payload = { id: "user-1", username: "tom" }) {
    return `token=${jwt.sign(payload, "a-different-secret", { expiresIn: "24h" })}`;
}
