// Runs before any source module is imported.
//
// This matters because several modules read process.env into a module-level const
// at import time and never look again:
//   src/app.js               -> SECRET_KEY
//   src/services/users.service.js -> jwtSecret
// Setting these inside a test would be too late.

// getLongDate() calls toLocaleDateString and getISODate() works in UTC, so the
// date assertions only hold with a fixed timezone. Node re-reads TZ on assignment.
process.env.TZ = "UTC";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.FRONTEND_URL = "http://localhost:5173";

// Never used — src/config/db.js is mocked in every test that reaches it — but it
// has to be present or src/server.js's env gate would be the only thing missing.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/tourganiser_test";
