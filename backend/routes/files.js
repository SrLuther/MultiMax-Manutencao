import path from "path";
import fs from "fs";
import express from "express";
import SftpClient from "ssh2-sftp-client";

function resolveSafe(base, p) {
  const full = path.resolve(base, p || ".");
  if (!full.startsWith(path.resolve(base))) {
    throw new Error("outside_base");
  }
  return full;
}

async function listLocal(base, target) {
  const dir = resolveSafe(base, target);
  const items = fs.readdirSync(dir).map((name) => {
    const stat = fs.statSync(path.join(dir, name));
    return {
      name,
      isDir: stat.isDirectory(),
      size: stat.size,
      mtime: stat.mtimeMs,
      mode: stat.mode
    };
  });
  return { path: path.relative(base, dir) || ".", items };
}

async function readLocal(base, target) {
  const file = resolveSafe(base, target);
  return fs.readFileSync(file, "utf8");
}

async function writeLocal(base, target, content) {
  const file = resolveSafe(base, target);
  fs.writeFileSync(file, content, "utf8");
}

async function deleteLocal(base, target) {
  const file = resolveSafe(base, target);
  const stat = fs.statSync(file);
  if (stat.isDirectory()) fs.rmSync(file, { recursive: true, force: true });
  else fs.unlinkSync(file);
}

async function renameLocal(base, from, to) {
  const src = resolveSafe(base, from);
  const dst = resolveSafe(base, to);
  fs.renameSync(src, dst);
}

export function filesRouter({ MODE, basePath }) {
  const router = express.Router();
  const useSftp = MODE === "production" && process.env.SFTP_ENABLED === "true";

  router.get("/list", async (req, res) => {
    try {
      const p = req.query.p || ".";
      if (!useSftp) {
        const data = await listLocal(basePath, p);
        return res.json(data);
      } else {
        const sftp = new SftpClient();
        await sftp.connect({
          host: process.env.SFTP_HOST,
          port: Number(process.env.SFTP_PORT || 22),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD
        });
        const remote = path.posix.join(basePath, p);
        const list = await sftp.list(remote);
        await sftp.end();
        return res.json({ path: p, items: list });
      }
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.get("/read", async (req, res) => {
    try {
      const p = req.query.p;
      if (!p) return res.status(400).json({ error: "missing_path" });
      if (!useSftp) {
        const data = await readLocal(basePath, p);
        return res.type("text/plain").send(data);
      } else {
        const sftp = new SftpClient();
        await sftp.connect({
          host: process.env.SFTP_HOST,
          port: Number(process.env.SFTP_PORT || 22),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD
        });
        const remote = path.posix.join(basePath, p);
        const data = await sftp.get(remote);
        await sftp.end();
        return res.type("application/octet-stream").send(data);
      }
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/write", async (req, res) => {
    try {
      const { p, content } = req.body || {};
      if (!p) return res.status(400).json({ error: "missing_path" });
      if (!useSftp) {
        await writeLocal(basePath, p, content || "");
        return res.json({ ok: true });
      } else {
        const sftp = new SftpClient();
        await sftp.connect({
          host: process.env.SFTP_HOST,
          port: Number(process.env.SFTP_PORT || 22),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD
        });
        const remote = path.posix.join(basePath, p);
        await sftp.put(Buffer.from(content || "", "utf8"), remote);
        await sftp.end();
        return res.json({ ok: true });
      }
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/delete", async (req, res) => {
    try {
      const { p } = req.body || {};
      if (!p) return res.status(400).json({ error: "missing_path" });
      if (!useSftp) {
        await deleteLocal(basePath, p);
        return res.json({ ok: true });
      } else {
        const sftp = new SftpClient();
        await sftp.connect({
          host: process.env.SFTP_HOST,
          port: Number(process.env.SFTP_PORT || 22),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD
        });
        const remote = path.posix.join(basePath, p);
        await sftp.delete(remote);
        await sftp.end();
        return res.json({ ok: true });
      }
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/rename", async (req, res) => {
    try {
      const { from, to } = req.body || {};
      if (!from || !to) return res.status(400).json({ error: "missing_params" });
      if (!useSftp) {
        await renameLocal(basePath, from, to);
        return res.json({ ok: true });
      } else {
        const sftp = new SftpClient();
        await sftp.connect({
          host: process.env.SFTP_HOST,
          port: Number(process.env.SFTP_PORT || 22),
          username: process.env.SFTP_USERNAME,
          password: process.env.SFTP_PASSWORD
        });
        const src = path.posix.join(basePath, from);
        const dst = path.posix.join(basePath, to);
        await sftp.rename(src, dst);
        await sftp.end();
        return res.json({ ok: true });
      }
    } catch (e) {
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  return router;
}
