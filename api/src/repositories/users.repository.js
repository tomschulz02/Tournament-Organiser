import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import DatabaseConnection from "../config/db";

const db = DatabaseConnection();

async function createUser(username, email, password) {
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) throw new Error("PASSWORD_HASHING_ERROR");

            const sql = "INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id, username, email";
            const result = await db.query(sql, [username, hash, email]);
            return result;
        });
    }

async function loginUser(username, password) {
        const sql = "SELECT * FROM users WHERE email = $1";
        const result = await db.query(sql, [username]);
        if (!result.success || result.message.length === 0) {
            throw new Error("USER_NOT_FOUND");
        }

        const user = result.message[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error("INCORRECT_PASSWORD");
        }

        return user;
    }

export const userRepository = {
    createUser,
    loginUser
};