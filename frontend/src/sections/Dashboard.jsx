import React, { useEffect, useMemo, useState } from "react";
import Terminal from "../components/Terminal.jsx";
import MonitorCharts from "../components/MonitorCharts.jsx";
import LogsViewer from "../components/LogsViewer.jsx";
import CommandsPanel from "../components/CommandsPanel.jsx";
import FilesManager from "../components/FilesManager.jsx";

function StatusBadge({ status }) {
  const color =
    status === "active" ? "bg-green-600" : status === "inactive" ? "bg-red-600" : "bg-yellow-600";
  return <span className={`px-2 py-1 rounded text-xs ${color}`}>{status}</span>;
}

export default function Dashboard({ user, onLogout }) {
  const [tab, setTab] = useState("geral");
  const [serviceStatus, setServiceStatus] = useState("unknown");
  const [siteStatus, setSiteStatus] = useState({ ok: false, status: 0 });
  const [metrics, setMetrics] = useState(null);

  async function fetchServiceStatus() {
    const r = await fetch("/api/service/status", { credentials: "include" });
    if (r.ok) {
      const d = await r.json();
      setServiceStatus(d.status);
    }
  }

  useEffect(() => {
    fetchServiceStatus();
    const t = setInterval(fetchServiceStatus, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/metrics`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "metrics") setMetrics(msg.data);
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/site-status`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "site") setSiteStatus(msg.data);
    };
    return () => ws.close();
  }, []);

  async function action(type) {
    await fetch(`/api/service/${type}`, { method: "POST", credentials: "include" });
    fetchServiceStatus();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST", credentials: "include" });
    onLogout();
  }

  const cards = useMemo(() => {
    const cpu = metrics?.cpu ?? 0;
    const mem = metrics?.mem?.usedPct ?? 0;
    const disk = metrics?.disk?.usedPct ?? 0;
    return { cpu, mem, disk };
  }, [metrics]);

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between p-4 bg-slate-800">
        <div className="font-semibold">Mutimax — Painel de Manutenção</div>
        <div className="text-sm">Usuário: {user?.username}</div>
        <button className="bg-slate-700 px-3 py-1 rounded" onClick={logout}>
          Sair
        </button>
      </header>
      <nav className="flex gap-2 p-2 bg-slate-800">
        {[
          ["geral", "Geral"],
          ["terminal", "Terminal"],
          ["arquivos", "Arquivos"],
          ["atualizacao", "Atualização"],
          ["logs", "Logs"],
          ["monitoramento", "Monitoramento"],
          ["comandos", "Comandos úteis"]
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1 rounded ${
              tab === id ? "bg-green-600" : "bg-slate-700 hover:bg-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="flex-1 overflow-auto p-4 space-y-4">
        {tab === "geral" && (
          <section className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded">
                <div className="text-sm">CPU</div>
                <div className="text-2xl">{cards.cpu}%</div>
              </div>
              <div className="bg-slate-800 p-4 rounded">
                <div className="text-sm">Memória</div>
                <div className="text-2xl">{cards.mem}%</div>
              </div>
              <div className="bg-slate-800 p-4 rounded">
                <div className="text-sm">Disco</div>
                <div className="text-2xl">{cards.disk}%</div>
              </div>
            </div>
            <div className="bg-slate-800 p-4 rounded flex items-center justify-between">
              <div>
                Status do serviço: <StatusBadge status={serviceStatus} />
              </div>
              <div className="flex gap-2">
                <button className="bg-green-600 px-3 py-1 rounded" onClick={() => action("start")}>
                  Iniciar
                </button>
                <button className="bg-red-600 px-3 py-1 rounded" onClick={() => action("stop")}>
                  Parar
                </button>
                <button
                  className="bg-yellow-600 px-3 py-1 rounded"
                  onClick={() => action("restart")}
                >
                  Reiniciar
                </button>
              </div>
            </div>
            <div className="bg-slate-800 p-4 rounded">
              Status externo:{" "}
              {siteStatus.ok ? (
                <span className="bg-green-600 px-2 py-1 rounded text-xs">Online — HTTP 200 OK</span>
              ) : (
                <span className="bg-red-600 px-2 py-1 rounded text-xs">Offline — Sem resposta</span>
              )}
            </div>
          </section>
        )}

        {tab === "terminal" && <Terminal />}
        {tab === "arquivos" && <FilesManager />}
        {tab === "atualizacao" && <UpdateSection />}
        {tab === "logs" && <LogsViewer />}
        {tab === "monitoramento" && <MonitorCharts />}
        {tab === "comandos" && <CommandsPanel />}
      </main>
    </div>
  );
}

function UpdateSection() {
  const [stream, setStream] = useState("");
  async function start() {
    await fetch("/api/update/start", { method: "POST", credentials: "include" });
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/update`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "log") setStream((s) => s + msg.data);
    };
  }
  return (
    <div className="space-y-2">
      <button className="bg-blue-600 px-3 py-1 rounded" onClick={start}>
        Atualizar Mutimax
      </button>
      <pre className="bg-slate-800 p-2 rounded h-64 overflow-auto whitespace-pre-wrap">{stream}</pre>
    </div>
  );
}
