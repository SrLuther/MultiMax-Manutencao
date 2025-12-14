import React, { useEffect, useState } from "react";

export default function LogsViewer() {
  const [updates, setUpdates] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [content, setContent] = useState("");

  useEffect(() => {
    fetch("/api/update/logs", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUpdates(d.files || []));
    fetch("/api/terminals/sessions", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setTerminals((d.sessions || []).map((s) => s.file)));
  }, []);

  async function openUpdateLog(name) {
    const r = await fetch(`/api/update/logs/${name}`, { credentials: "include" });
    setContent(await r.text());
  }

  async function openTerminalLog(name) {
    const r = await fetch(`/api/terminals/logs/${name}`, { credentials: "include" });
    setContent(await r.text());
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <h3 className="font-semibold mb-2">Logs de Atualizações</h3>
        <ul className="space-y-1">
          {updates.map((f) => (
            <li key={f}>
              <button className="underline" onClick={() => openUpdateLog(f)}>
                {f}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold mb-2">Logs de Terminais</h3>
        <ul className="space-y-1">
          {terminals.map((f) => (
            <li key={f}>
              <button className="underline" onClick={() => openTerminalLog(f)}>
                {f}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold mb-2">Conteúdo</h3>
        <pre className="bg-slate-800 p-2 rounded h-64 overflow-auto whitespace-pre-wrap">{content}</pre>
      </div>
    </div>
  );
}
