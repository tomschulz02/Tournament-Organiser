import { userService } from "../services/users.service.js";
import { SESSION_TTL_MS, sessionCookieOptions } from "../config/auth.js";
import { AppError } from "../errors.js";

// Controllers do not catch. Express 5 forwards a rejected promise from an async
// handler to the error middleware, which is the single place that maps a failure
// to a status, builds the envelope and logs.

async function signup(req, res) {
    const { username, email, password, confirmPassword } = req.body;
    const created = await userService.createUser(username, email, password, confirmPassword);

    res.cookie('token', created.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: { username: created.username }
    });
}

async function login(req, res) {
    const { email, password } = req.body;
    const session = await userService.loginUser(email, password);

    res.cookie('token', session.token, { ...sessionCookieOptions(), maxAge: SESSION_TTL_MS });
    res.status(200).json({
        success: true,
        message: 'Login successful',
        data: { username: session.username }
    });
}

async function logout(req, res) {
    res.clearCookie('token', sessionCookieOptions());
    res.status(200).json({ success: true, message: 'User logged out', data: null });
}

// Not implemented. Returning 501 is what stops the route hanging: the handler
// used to have an empty try block and never called res at all.
async function getUserProfile(req, res) {
    throw new AppError("NOT_IMPLEMENTED");
}

async function checkLogin(req, res) {
    const loggedIn = Boolean(req.user);

    res.status(200).json({
        success: true,
        message: loggedIn ? 'Logged in' : 'Not logged in',
        data: { loggedIn, username: loggedIn ? req.user.username : null }
    });
}

export const userController = {
    signup,
    login,
    logout,
    getUserProfile,
    checkLogin
}
