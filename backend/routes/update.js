import path from "path";
import fs from "fs";
import { exec } from "child_process";
import express from "express";

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, "-");
}

export function updateRouter({ MODE, MUTIMAX_PATH, updateLogDir, LOG_PATH }) {
  const router = express.Router();

  router.post("/start", async (req, res) => {
    const logFile = path.join(updateLogDir, `${timestamp()}.log`);
    const procInfo = { id: path.basename(logFile, ".log") };
    const lockFile = path.join(path.resolve(LOG_PATH || updateLogDir, ".."), ".update.lock");
    if (fs.existsSync(lockFile)) {
      return res.status(409).json({ error: "update_in_progress" });
    }
    fs.writeFileSync(lockFile, String(Date.now()));
    // In local mode, we simulate via background writer
    if (MODE === "local") {
      const lines = [
        "[init] Iniciando atualização simulada...",
        "[fetch] Baixando pacote...",
        "[apply] Aplicando alterações...",
        "[done] Atualização concluída com sucesso."
      ];
      const writer = fs.createWriteStream(logFile, { flags: "a" });
      let idx = 0;
      const interval = setInterval(() => {
        if (idx >= lines.length) {
          clearInterval(interval);
          writer.end();
          try { fs.unlinkSync(lockFile); } catch {}
        } else {
          writer.write(lines[idx] + "\n");
          idx++;
        }
      }, 1000);
      return res.json({ ok: true, id: procInfo.id });
    } else {
      const cmd = `bash -lc 'cd ${MUTIMAX_PATH} && ./update.sh'`;
      const child = exec(cmd, { shell: "/bin/bash" });
      const writer = fs.createWriteStream(logFile, { flags: "a" });
      child.stdout.on("data", (d) => writer.write(d));
      child.stderr.on("data", (d) => writer.write(d));
      child.on("close", () => {
        writer.end();
        try { fs.unlinkSync(lockFile); } catch {}
      });
      return res.json({ ok: true, id: procInfo.id });
    }
  });

  router.get("/logs", async (req, res) => {
    const files = fs
      .readdirSync(updateLogDir)
      .filter((f) => f.endsWith(".log"))
      .sort()
      .reverse();
    res.json({ files });
  });

  router.get("/logs/:name", async (req, res) => {
    const p = path.join(updateLogDir, req.params.name);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "not_found" });
    res.type("text/plain").send(fs.readFileSync(p, "utf8"));
  });

  return router;
}

// WS: stream live logs for last started update (simple approach)
export function updateWs(ws, _req, { MODE, updateLogDir }) {
  ws.send(JSON.stringify({ type: "hello", mode: MODE }));
  // For simplicity, tail the latest log file
  const files = fs
    .readdirSync(updateLogDir)
    .filter((f) => f.endsWith(".log"))
    .sort()
    .reverse();
  if (files.length === 0) {
    ws.send(JSON.stringify({ type: "end" }));
    ws.close();
    return;
  }
  const target = path.join(updateLogDir, files[0]);
  let pos = 0;
  const interval = setInterval(() => {
    if (!fs.existsSync(target)) return;
    const buf = fs.readFileSync(target, "utf8");
    if (buf.length > pos) {
      const chunk = buf.slice(pos);
      ws.send(JSON.stringify({ type: "log", data: chunk }));
      pos = buf.length;
    }
  }, 1000);
  ws.on("close", () => clearInterval(interval));
}
