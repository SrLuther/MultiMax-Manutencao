import React, { useEffect, useState } from "react";

export default function FilesManager() {
  const [path, setPath] = useState(".");
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState("");

  async function load(p = path) {
    const r = await fetch(`/api/files/list?p=${encodeURIComponent(p)}`, { credentials: "include" });
    const d = await r.json();
    setPath(d.path);
    setItems(d.items);
    setSelected(null);
    setContent("");
  }

  useEffect(() => {
    load(".");
  }, []);

  async function open(item) {
    if (item.isDir) {
      load(`${path}/${item.name}`);
    } else {
      const r = await fetch(`/api/files/read?p=${encodeURIComponent(`${path}/${item.name}`)}`, {
        credentials: "include"
      });
      setSelected(item);
      setContent(await r.text());
    }
  }

  async function save() {
    const p = `${path}/${selected.name}`;
    await fetch(`/api/files/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ p, content })
    });
  }

  async function del(item) {
    const p = `${path}/${item.name}`;
    await fetch(`/api/files/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ p })
    });
    load(path);
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <div className="mb-2 text-sm">Pasta: {path}</div>
        <ul className="space-y-1">
          {path !== "." && (
            <li>
              <button className="underline" onClick={() => load(path.split("/").slice(0, -1).join("/") || ".")}>
                .. (voltar)
              </button>
            </li>
          )}
          {items.map((it) => (
            <li key={it.name} className="flex items-center justify-between">
              <button className="underline" onClick={() => open(it)}>
                {it.isDir ? "📁" : "📄"} {it.name}
              </button>
              <button className="text-red-400" onClick={() => del(it)}>
                excluir
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="col-span-2">
        {selected ? (
          <div className="space-y-2">
            <div className="text-sm">Editando: {selected.name}</div>
            <textarea
              className="w-full h-64 bg-slate-800 p-2 rounded font-mono"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button className="bg-green-600 px-3 py-1 rounded" onClick={save}>
              Salvar
            </button>
          </div>
        ) : (
          <div className="text-slate-400">Selecione um arquivo para editar</div>
        )}
      </div>
    </div>
  );
}
