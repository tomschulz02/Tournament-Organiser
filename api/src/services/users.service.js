import { userRepository } from "../repositories/users.repository.js"
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { SESSION_TTL_JWT } from "../config/auth.js";
import { AppError } from "../errors.js";
import { assertText } from "../utils/validation.js";

// Raised from 10 on 2026-08-10. No migration is needed and none is possible:
// bcrypt stores the cost inside the hash, so every existing password keeps
// verifying at the cost it was written with, and only new or changed ones are
// written at 12.
const saltRounds = 12;
const jwtSecret = process.env.JWT_SECRET;

function issueToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, email: user.email, admin: user.admin },
        jwtSecret,
        { expiresIn: SESSION_TTL_JWT }
    );
}

// Postgres unique_violation. The constraint name tells us which field collided;
// see docs/database.md.
const UNIQUE_VIOLATION = "23505";
const DUPLICATE_FIELD = {
    users_email_key: "EMAIL_ALREADY_REGISTERED",
    users_username_key: "USERNAME_TAKEN"
};

async function createUser(username, email, password, confirmPassword) {
    if (password !== confirmPassword) {
        throw new AppError("PASSWORDS_DO_NOT_MATCH");
    }
    if (!username || !email || !password) {
        throw new AppError("MISSING_FIELDS");
    }

    // users.username and users.email are varchar(100) — see docs/database.md.
    // Over that, the insert used to fail inside Postgres and surface as a 500.
    // Nothing checks the password's length: it is stored as a bcrypt hash of
    // fixed size, so no column can overflow.
    assertText(username, "username", { max: 100 });
    assertText(email, "email", { max: 100 });

    const hash = await bcrypt.hash(password, saltRounds);

    let user;
    try {
        user = await userRepository.createUser(username, email, hash);
    } catch (err) {
        // The repository preserves the pg error as cause, so a collision on an
        // existing account is a 409 rather than the 500 it used to be. Anything
        // else propagates untouched and the error middleware makes it a 500.
        const code = err.cause?.code === UNIQUE_VIOLATION ? DUPLICATE_FIELD[err.cause.constraint] : undefined;
        if (!code) {
            throw err;
        }

        throw new AppError(code, { cause: err });
    }

    return { token: issueToken(user), username: user.username };
}

async function loginUser(email, password) {
    if (!email || !password) {
        throw new AppError("MISSING_FIELDS");
    }

    const user = await userRepository.findUserByEmail(email);

    // Deliberately identical outcomes for "no such user" and "wrong password".
    // Distinguishing them lets an attacker enumerate registered accounts.
    if (!user) {
        throw new AppError("INVALID_CREDENTIALS");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new AppError("INVALID_CREDENTIALS");
    }

    // The username comes back alongside the token because the client needs it to
    // greet the user; it previously got nothing and rendered "Welcome, undefined".
    return { token: issueToken(user), username: user.username };
}

export const userService = {
    createUser,
    loginUser
}