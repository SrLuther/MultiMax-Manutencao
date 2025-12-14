import React from "react";

const commands = [
  { cmd: "systemctl status mutimax", desc: "Exibe status do serviço" },
  { cmd: "journalctl -u mutimax -f", desc: "Logs em tempo real" },
  { cmd: "cd /opt/mutimax && ./update.sh", desc: "Atualiza Mutimax" },
  { cmd: "tail -n 50 /opt/mutimax/logs/error.log", desc: "Últimos erros" },
  { cmd: "df -h", desc: "Espaço em disco" },
  { cmd: "htop", desc: "Monitora CPU/memória" }
];

export default function CommandsPanel() {
  function copy(cmd) {
    navigator.clipboard.writeText(cmd);
  }

  return (
    <div className="space-y-2">
      {commands.map((c) => (
        <div key={c.cmd} className="bg-slate-800 p-3 rounded flex items-center justify-between">
          <div>
            <div className="font-mono text-sm">{c.cmd}</div>
            <div className="text-xs text-slate-400">{c.desc}</div>
          </div>
          <button className="bg-slate-700 px-2 py-1 rounded" onClick={() => copy(c.cmd)}>
            Copiar
          </button>
        </div>
      ))}
      <div className="text-xs text-slate-400">
        Você pode executar estes comandos diretamente no Terminal integrado.
      </div>
    </div>
  );
}
