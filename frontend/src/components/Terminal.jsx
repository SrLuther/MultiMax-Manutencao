import React, { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import "xterm/css/xterm.css";

export default function Terminal() {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const wsRef = useRef(null);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    const term = new XTerm({ cursorBlink: true, fontSize: 14, theme: { background: "#0f172a" } });
    termRef.current = term;
    term.open(containerRef.current);

    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/terminal`);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "data") term.write(msg.data);
      if (msg.type === "session") setSessionId(msg.id);
    };
    term.onData((d) => {
      ws.send(JSON.stringify({ type: "input", data: d }));
    });
    return () => {
      ws.close();
      term.dispose();
    };
  }, []);

  return (
    <div>
      <div className="text-sm mb-2">Sessão: {sessionId}</div>
      <div ref={containerRef} className="bg-slate-900 rounded h-[420px]" />
    </div>
  );
}
