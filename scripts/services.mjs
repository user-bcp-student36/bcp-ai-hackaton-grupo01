// Usage: node scripts/services.mjs <start|stop|restart|status> [--build]
// Runs the API (built, port 3000) and the Vite web dev server (port 5173) in the background.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_DIR = join(ROOT, ".orchestrate");
const STATE_FILE = join(STATE_DIR, "services.json");
const IS_WINDOWS = process.platform === "win32";
const STARTUP_WAIT_MS = 3000;

const SERVICES = [
  {
    name: "api",
    url: "http://127.0.0.1:3000",
    cwd: join(ROOT, "api"),
    args: ["--env-file-if-exists=../.env", "dist/server.js"],
  },
  {
    name: "web",
    url: "http://localhost:5173",
    cwd: join(ROOT, "web"),
    args: [join(ROOT, "node_modules", "vite", "bin", "vite.js")],
  },
];

function readState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : {};
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killTree(pid) {
  if (IS_WINDOWS) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

function build() {
  console.log("Building contracts, api and web...");
  const result = spawnSync("npm", ["run", "build"], {
    cwd: ROOT,
    stdio: "inherit",
    shell: IS_WINDOWS,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function start(forceBuild) {
  const state = readState();
  const running = SERVICES.filter((s) => state[s.name] && isRunning(state[s.name]));
  if (running.length > 0) {
    console.log(`Already running: ${running.map((s) => s.name).join(", ")}. Use restart.`);
    return;
  }
  if (forceBuild || !existsSync(join(ROOT, "api", "dist", "server.js"))) build();

  mkdirSync(STATE_DIR, { recursive: true });
  const next = {};
  for (const service of SERVICES) {
    const log = openSync(join(STATE_DIR, `${service.name}.log`), "w");
    const child = spawn(process.execPath, service.args, {
      cwd: service.cwd,
      detached: true,
      stdio: ["ignore", log, log],
      windowsHide: true,
    });
    child.unref();
    next[service.name] = child.pid;
  }
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));

  await new Promise((done) => setTimeout(done, STARTUP_WAIT_MS));
  for (const service of SERVICES) {
    const alive = isRunning(next[service.name]);
    console.log(
      alive
        ? `${service.name}: running (pid ${next[service.name]}) ${service.url}`
        : `${service.name}: FAILED to start, see .orchestrate/${service.name}.log`,
    );
  }
}

function stop() {
  const state = readState();
  for (const service of SERVICES) {
    const pid = state[service.name];
    if (pid && isRunning(pid)) {
      killTree(pid);
      console.log(`${service.name}: stopped (pid ${pid})`);
    } else {
      console.log(`${service.name}: not running`);
    }
  }
  rmSync(STATE_FILE, { force: true });
}

function status() {
  const state = readState();
  for (const service of SERVICES) {
    const pid = state[service.name];
    console.log(
      pid && isRunning(pid)
        ? `${service.name}: running (pid ${pid}) ${service.url}`
        : `${service.name}: stopped`,
    );
  }
}

const [command, ...flags] = process.argv.slice(2);
const shouldBuild = flags.includes("--build");

if (command === "start") await start(shouldBuild);
else if (command === "stop") stop();
else if (command === "restart") {
  stop();
  await start(shouldBuild);
} else if (command === "status") status();
else {
  console.error("Usage: node scripts/services.mjs <start|stop|restart|status> [--build]");
  process.exit(1);
}
