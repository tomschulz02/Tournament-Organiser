import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

// Fail at boot rather than at request time. Without these, jwt.sign throws on the
// first login and pg fails on the first query, which is far harder to diagnose.
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
