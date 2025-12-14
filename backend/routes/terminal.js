import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "node-pty";
import express from "express";

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-");
}

const sessions = new Map(); // id -> { pty, logFile, writer }

export function terminalsRouter({ terminalLogDir }) {
  const router = express.Router();

  router.get("/sessions", (req, res) => {
    const list = fs
      .readdirSync(terminalLogDir)
      .filter((f) => f.endsWith(".log"))
      .map((f) => ({ id: path.basename(f, ".log"), file: f }));
    res.json({ sessions: list });
  });

  router.get("/logs/:name", (req, res) => {
    const p = path.join(terminalLogDir, req.params.name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "not_found" });
    res.type("text/plain").send(fs.readFileSync(p, "utf8"));
  });

  return router;
}

export function terminalWs(ws, _req, { MODE, terminalLogDir }) {
  const shell = MODE === "local" ? (process.env.COMSPEC || "powershell.exe") : "/bin/bash";
  const id = timestamp();
  const logFile = path.join(terminalLogDir, `${id}.log`);
  const writer = fs.createWriteStream(logFile, { flags: "a" });

  const pty = spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  });

  sessions.set(id, { pty, logFile, writer });
  ws.send(JSON.stringify({ type: "session", id }));

  pty.onData((data) => {
    writer.write(data);
    ws.send(JSON.stringify({ type: "data", data }));
  });

  ws.on("message", (msg) => {
    try {
      const { type, data } = JSON.parse(msg);
      if (type === "input") {
        pty.write(data);
      } else if (type === "resize") {
        const { cols, rows } = data || {};
        if (cols && rows) pty.resize(cols, rows);
      }
    } catch {}
  });

  ws.on("close", () => {
    try {
      pty.kill();
      writer.end();
    } finally {
      sessions.delete(id);
    }
  });
}
