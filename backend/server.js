import path from "path";
import fs from "fs";
import url from "url";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import expressWsLib from "express-ws";
import rateLimit from "express-rate-limit";
import FileStoreFactory from "session-file-store";

// Load env
const envPath = fs.existsSync(path.resolve(process.cwd(), ".env.local"))
  ? ".env.local"
  : ".env.production";
dotenv.config({ path: envPath });

const MODE = process.env.MODE || "local";
const PORT = Number(process.env.INTERFACE_PORT || 8080);
const MUTIMAX_PATH = process.env.MUTIMAX_PATH || "./test-data";
const LOG_PATH = process.env.LOG_PATH || "./logs";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const DOMAIN_TO_MONITOR = process.env.DOMAIN_TO_MONITOR || "http://localhost:3000";

// Ensure required dirs
const terminalLogDir = path.resolve(LOG_PATH, "terminals");
const updateLogDir = path.resolve(LOG_PATH, "updates");
const securityLogDir = path.resolve(LOG_PATH, "security");
const sessionDir = path.resolve(LOG_PATH, "sessions");
fs.mkdirSync(terminalLogDir, { recursive: true });
fs.mkdirSync(updateLogDir, { recursive: true });
fs.mkdirSync(securityLogDir, { recursive: true });
fs.mkdirSync(sessionDir, { recursive: true });

const app = express();
const expressWs = expressWsLib(app);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'", "ws:", "wss:", "http:", "https:"]
      }
    }
  })
);
app.use(express.json({ limit: "2mb" }));
const FileStore = FileStoreFactory(session);
app.use(
  session({
    name: "mutimax.sid",
    secret: "mutimax-interface-secret",
    resave: false,
    saveUninitialized: false,
    store: new FileStore({ path: sessionDir, retries: 1, ttl: 60 * 30 }),
    cookie: {
      httpOnly: true,
      secure: false, // behind nginx in prod; keep false here
      sameSite: "lax",
      maxAge: 30 * 60 * 1000
    },
    rolling: true
  })
);

// CORS mainly for local dev; in production we serve same origin
app.use(
  cors({
    origin: (origin, cb) => cb(null, true),
    credentials: true
  })
);

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// Routes: Auth
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.post("/api/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "missing_credentials" });
  if (MODE === "production" && password.length < 12) {
    return res.status(400).json({ error: "weak_password" });
  }
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    req.session.user = { username };
    const entry = `[login_success] user=${username} ip=${req.ip} ua=${req.headers["user-agent"] || ""}\n`;
    fs.appendFileSync(path.join(securityLogDir, "auth.log"), entry);
    return res.json({ ok: true });
  }
  const entry = `[login_failure] user=${username} ip=${req.ip} ua=${req.headers["user-agent"] || ""}\n`;
  fs.appendFileSync(path.join(securityLogDir, "auth.log"), entry);
  return res.status(403).json({ error: "invalid_credentials" });
});

app.post("/api/logout", (req, res) => {
  const user = req.session?.user?.username || "";
  const entry = `[logout] user=${user} ip=${req.ip} ua=${req.headers["user-agent"] || ""}\n`;
  fs.appendFileSync(path.join(securityLogDir, "auth.log"), entry);
  req.session?.destroy(() => {});
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  if (req.session?.authenticated) return res.json({ user: req.session.user });
  res.status(401).json({ error: "unauthorized" });
});

// Service control
import { serviceRouter } from "./routes/service.js";
const SERVICE_NAME = process.env.MUTIMAX_SERVICE_NAME || "mutimax";
app.use("/api/service", requireAuth, serviceRouter({ MODE, MUTIMAX_PATH, serviceName: SERVICE_NAME }));

// Update
import { updateRouter, updateWs } from "./routes/update.js";
app.use("/api/update", requireAuth, updateRouter({ MODE, MUTIMAX_PATH, updateLogDir, LOG_PATH }));
app.ws("/ws/update", (ws, req) => updateWs(ws, req, { MODE, updateLogDir }));

// Terminal WS + sessions
import { terminalsRouter, terminalWs } from "./routes/terminal.js";
app.use("/api/terminals", requireAuth, terminalsRouter({ terminalLogDir }));
app.ws("/ws/terminal", (ws, req) => terminalWs(ws, req, { MODE, terminalLogDir }));

// Files (local FS in MODE=local; optional SFTP in prod)
import { filesRouter } from "./routes/files.js";
app.use("/api/files", requireAuth, filesRouter({ MODE, basePath: MUTIMAX_PATH }));

// Metrics + site status
import { metricsRouter, metricsWs, siteStatusRouter, siteStatusWs } from "./routes/metrics.js";
app.use("/api/metrics", requireAuth, metricsRouter());
app.ws("/ws/metrics", (ws, req) => metricsWs(ws, req));
app.use("/api/site-status", requireAuth, siteStatusRouter({ DOMAIN_TO_MONITOR }));
app.ws("/ws/site-status", (ws, req) => siteStatusWs(ws, req, { DOMAIN_TO_MONITOR }));

// Static frontend under /manutencao
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../frontend/dist");
app.use("/manutencao", express.static(frontendDist));
app.get("/manutencao/*", (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

// Root redirect
app.get("/", (req, res) => res.redirect("/manutencao/"));

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, () => {
  console.log(`Mutimax Interface (${MODE}) listening on http://localhost:${PORT}/manutencao`);
});
