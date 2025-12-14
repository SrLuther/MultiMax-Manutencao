import React, { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      onLogin({ username });
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Falha no login");
    }
  }

  return (
    <div className="flex items-center justify-center h-full">
      <form onSubmit={submit} className="bg-slate-800 p-6 rounded w-[360px] space-y-4">
        <h1 className="text-xl font-semibold">Mutimax — Manutenção</h1>
        <input
          className="w-full p-2 rounded bg-slate-700"
          placeholder="Usuário"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full p-2 rounded bg-slate-700"
          placeholder="Senha"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <button className="w-full bg-green-600 hover:bg-green-700 p-2 rounded">Entrar</button>
        <div className="text-xs text-slate-400">
          Em produção, a senha deve ter no mínimo 12 caracteres.
        </div>
      </form>
    </div>
  );
}
