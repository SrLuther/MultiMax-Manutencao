import React, { useEffect, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Title,
  Tooltip,
  Legend
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

export default function MonitorCharts() {
  const cpuRef = useRef(null);
  const memRef = useRef(null);
  const diskRef = useRef(null);
  const [charts, setCharts] = useState({});

  useEffect(() => {
    const makeChart = (ctx, label) =>
      new Chart(ctx, {
        type: "line",
        data: { labels: [], datasets: [{ label, borderColor: "#22c55e", data: [] }] },
        options: {
          animation: false,
          scales: { y: { min: 0, max: 100 } },
          plugins: { legend: { display: false } }
        }
      });
    const c = {
      cpu: makeChart(cpuRef.current.getContext("2d"), "CPU (%)"),
      mem: makeChart(memRef.current.getContext("2d"), "Memória (%)"),
      disk: makeChart(diskRef.current.getContext("2d"), "Disco (%)")
    };
    setCharts(c);
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/metrics`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type !== "metrics") return;
      const { cpu, mem, disk } = msg.data;
      const colorFor = (val) => (val > 95 ? "#ef4444" : val > 80 ? "#f59e0b" : "#22c55e");
      const push = (chart, val) => {
        chart.data.labels.push("");
        chart.data.datasets[0].data.push(val);
        chart.data.datasets[0].borderColor = colorFor(val);
        if (chart.data.labels.length > 30) {
          chart.data.labels.shift();
          chart.data.datasets[0].data.shift();
        }
        chart.update();
      };
      push(c.cpu, cpu);
      push(c.mem, mem.usedPct);
      push(c.disk, disk.usedPct);
    };
    return () => {
      ws.close();
      Object.values(c).forEach((ch) => ch.destroy());
    };
  }, []);

  return (
    <div className="grid grid-cols-3 gap-4">
      <canvas ref={cpuRef} className="bg-slate-800 p-2 rounded h-64"></canvas>
      <canvas ref={memRef} className="bg-slate-800 p-2 rounded h-64"></canvas>
      <canvas ref={diskRef} className="bg-slate-800 p-2 rounded h-64"></canvas>
    </div>
  );
}
