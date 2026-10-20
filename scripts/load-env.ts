// Load .env for CLI scripts (Next.js loads it automatically for the app).
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
