import si from "systeminformation";
import express from "express";
import https from "https";
import http from "http";

let latestMetrics = {
  cpu: 0,
  mem: { usedPct: 0, total: 0, used: 0 },
  disk: { usedPct: 0, total: 0, used: 0 }
};

async function collectOnce() {
  const [load, mem, fsSize] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]);
  const cpu = Math.round(load.currentload);
  const usedPctMem = Math.round((mem.active / mem.total) * 100);
  const diskMain = fsSize.find((d) => d.mount === "/" || d.fs === "/" || d.mount === "C:");
  const diskPct = diskMain ? Math.round(diskMain.use) : 0;
  latestMetrics = {
    cpu,
    mem: { usedPct: usedPctMem, total: mem.total, used: mem.active },
    disk: { usedPct: diskPct, total: diskMain?.size || 0, used: diskMain?.used || 0 }
  };
  return latestMetrics;
}

const METRICS_INTERVAL = Number(process.env.METRICS_INTERVAL || 10000);
setInterval(() => {
  collectOnce().catch(() => {});
}, METRICS_INTERVAL);
collectOnce().catch(() => {});

export function metricsRouter() {
  const router = express.Router();
  router.get("/", async (req, res) => {
    res.json(latestMetrics);
  });
  return router;
}

export function metricsWs(ws, _req) {
  ws.send(JSON.stringify({ type: "metrics", data: latestMetrics }));
  const interval = setInterval(async () => {
    ws.send(JSON.stringify({ type: "metrics", data: latestMetrics }));
  }, METRICS_INTERVAL);
  ws.on("close", () => clearInterval(interval));
}

function checkUrl(urlStr) {
  return new Promise((resolve) => {
    const isHttps = urlStr.startsWith("https://");
    const client = isHttps ? https : http;
    const req = client
      .get(urlStr, (res) => {
        resolve({ ok: res.statusCode === 200, status: res.statusCode });
        res.resume();
      })
      .on("error", () => resolve({ ok: false, status: 0 }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
}

let latestSite = { ok: false, status: 0 };

export function siteStatusRouter({ DOMAIN_TO_MONITOR }) {
  const router = express.Router();
  router.get("/", async (req, res) => {
    res.json(latestSite);
  });
  // background check
  setInterval(async () => {
    latestSite = await checkUrl(DOMAIN_TO_MONITOR);
  }, 30_000);
  // initial
  checkUrl(DOMAIN_TO_MONITOR).then((r) => (latestSite = r));
  return router;
}

export function siteStatusWs(ws, _req, { DOMAIN_TO_MONITOR }) {
  const sendNow = async () => {
    ws.send(JSON.stringify({ type: "site", data: latestSite }));
  };
  const interval = setInterval(sendNow, 30_000);
  sendNow();
  ws.on("close", () => clearInterval(interval));
}
