import { exec } from "child_process";
import express from "express";

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { shell: "/bin/bash" }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout?.trim(), stderr: stderr?.trim(), error: err?.message });
    });
  });
}

export function serviceRouter({ MODE, serviceName = "mutimax" }) {
  const router = express.Router();

  router.get("/status", async (req, res) => {
    if (MODE === "local") {
      // simulate status toggling
      return res.json({ status: "active" });
    }
    const r = await run(`systemctl is-active ${serviceName} || true`);
    res.json({ status: r.stdout || "unknown" });
  });

  router.post("/start", async (req, res) => {
    if (MODE === "local") return res.json({ ok: true, message: "started (simulado)" });
    const r = await run(`sudo systemctl start ${serviceName}`);
    res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr, error: r.error });
  });

  router.post("/stop", async (req, res) => {
    if (MODE === "local") return res.json({ ok: true, message: "stopped (simulado)" });
    if (MODE === "production") {
      const c = (req.body?.confirm || "").trim().toUpperCase();
      if (c !== "CONFIRMAR") {
        return res.status(400).json({ ok: false, error: "confirm_required" });
      }
    }
    const r = await run(`sudo systemctl stop ${serviceName}`);
    res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr, error: r.error });
  });

  router.post("/restart", async (req, res) => {
    if (MODE === "local") return res.json({ ok: true, message: "restarted (simulado)" });
    const r = await run(`sudo systemctl restart ${serviceName}`);
    res.json({ ok: r.ok, stdout: r.stdout, stderr: r.stderr, error: r.error });
  });

  return router;
}
