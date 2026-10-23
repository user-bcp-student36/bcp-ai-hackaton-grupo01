// Usage: node scripts/reset-db.mjs
// Deletes the local SQLite database, then migrates and seeds it again.
// Stop the API first (node scripts/services.mjs stop): an open database file cannot be deleted on Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DATABASE_PATH = ".orchestrate/wallet-demo.sqlite";
const SQLITE_SUFFIXES = ["", "-wal", "-shm", "-journal"];

function configuredDatabasePath() {
  const envFile = resolve(ROOT, ".env");
  if (!existsSync(envFile)) return DEFAULT_DATABASE_PATH;
  const line = readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("DATABASE_PATH="));
  return line?.slice("DATABASE_PATH=".length).trim() || DEFAULT_DATABASE_PATH;
}

function run(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const databasePath = resolve(ROOT, configuredDatabasePath());
for (const suffix of SQLITE_SUFFIXES) {
  try {
    rmSync(databasePath + suffix, { force: true });
  } catch {
    console.error(`Cannot delete ${databasePath + suffix}: is the API still running?`);
    console.error("Run: node scripts/services.mjs stop");
    process.exit(1);
  }
}
console.log(`Deleted ${databasePath}`);

run("db:migrate");
run("seed:demo");
console.log("Database purged, migrated and seeded.");
