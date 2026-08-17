import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPayload = { type: "line" | "bar" | "area" | "pie" | "donut" | "scatter" | "histogram" | "kpi" | "table"; title: string; description: string; data: Array<Record<string, unknown>>; xKey?: string; yKeys?: string[]; valueKey?: string; nameKey?: string; formatter?: "currency" | "number" | "percent" };
const colors = ["#62d7ff", "#8b5cf6", "#38bdf8", "#34d399", "#fbbf24", "#fb7185"];
const numeric = (value: unknown) => typeof value === "number" ? value : Number(value ?? 0);
const display = (value: unknown, formatter?: ChartPayload["formatter"]) => formatter === "currency" ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(numeric(value)) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(numeric(value));

function Histogram({ payload }: { payload: ChartPayload }) {
  const key = payload.xKey || payload.yKeys?.[0] || "value";
  const values = payload.data.map(row => numeric(row[key])).filter(Number.isFinite);
  const min = Math.min(...values); const max = Math.max(...values); const width = Math.max(1, (max - min) / 8);
  const bins = Array.from({ length: 8 }, (_, index) => ({ range: `${Math.round(min + index * width)}–${Math.round(min + (index + 1) * width)}`, count: 0 }));
  values.forEach(value => { bins[Math.min(7, Math.floor((value - min) / width))].count += 1; });
  return <ResponsiveContainer width="100%" height={280}><BarChart data={bins}><CartesianGrid stroke="#1f3347" vertical={false} /><XAxis dataKey="range" tick={{ fill: "#7990a8", fontSize: 11 }} interval={1} /><YAxis tick={{ fill: "#7990a8", fontSize: 11 }} /><Tooltip contentStyle={{ background: "#0b1826", border: "1px solid #28415c", borderRadius: 12 }} /><Bar dataKey="count" fill="#62d7ff" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>;
}

export default function DynamicChart({ payload }: { payload: ChartPayload }) {
  if (!payload.data?.length) return <div className="grid h-56 place-items-center text-sm text-slate-500">No chartable values returned.</div>;
  const xKey = payload.xKey || Object.keys(payload.data[0])[0];
  const yKeys = payload.yKeys?.length ? payload.yKeys : Object.keys(payload.data[0]).filter(key => key !== xKey).slice(0, 2);
  if (payload.type === "kpi") return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{yKeys.map(key => <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs font-medium uppercase tracking-[0.13em] text-slate-500">{key.replace(/_/g, " ")}</p><p className="mt-2 text-2xl font-semibold text-white">{display(payload.data[0][key], payload.formatter)}</p></div>)}</div>;
  if (payload.type === "table") return <div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{Object.keys(payload.data[0]).map(key => <th className="border-b border-slate-800 px-3 py-2 text-left font-medium text-slate-400" key={key}>{key.replace(/_/g, " ")}</th>)}</tr></thead><tbody>{payload.data.map((row, i) => <tr key={i}>{Object.entries(row).map(([key, value]) => <td className="border-b border-slate-900 px-3 py-2 text-slate-300" key={key}>{typeof value === "number" ? display(value, payload.formatter) : String(value)}</td>)}</tr>)}</tbody></table></div>;
  if (payload.type === "histogram") return <Histogram payload={payload} />;
  if (payload.type === "pie" || payload.type === "donut") return <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={payload.data} dataKey={payload.valueKey || yKeys[0]} nameKey={payload.nameKey || xKey} innerRadius={payload.type === "donut" ? 60 : 0} outerRadius={98} paddingAngle={3}>{payload.data.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ background: "#0b1826", border: "1px solid #28415c", borderRadius: 12 }} formatter={value => display(value, payload.formatter)} /></PieChart></ResponsiveContainer>;
  if (payload.type === "scatter") return <ResponsiveContainer width="100%" height={280}><ScatterChart><CartesianGrid stroke="#1f3347" /><XAxis dataKey={xKey} name={xKey} tick={{ fill: "#7990a8", fontSize: 11 }} /><YAxis dataKey={yKeys[0]} name={yKeys[0]} tick={{ fill: "#7990a8", fontSize: 11 }} /><Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "#0b1826", border: "1px solid #28415c", borderRadius: 12 }} /><Scatter data={payload.data} fill="#62d7ff" /></ScatterChart></ResponsiveContainer>;
  const shared = <><CartesianGrid stroke="#1f3347" vertical={false} /><XAxis dataKey={xKey} tick={{ fill: "#7990a8", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#7990a8", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#0b1826", border: "1px solid #28415c", borderRadius: 12 }} formatter={value => display(value, payload.formatter)} /></>;
  if (payload.type === "area") return <ResponsiveContainer width="100%" height={280}><AreaChart data={payload.data}>{shared}{yKeys.map((key, index) => <Area key={key} type="monotone" dataKey={key} stroke={colors[index]} fill={colors[index]} fillOpacity={0.18} strokeWidth={2} />)}</AreaChart></ResponsiveContainer>;
  if (payload.type === "line") return <ResponsiveContainer width="100%" height={280}><LineChart data={payload.data}>{shared}{yKeys.map((key, index) => <Line key={key} type="monotone" dataKey={key} stroke={colors[index]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />)}</LineChart></ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height={280}><BarChart data={payload.data}>{shared}{yKeys.map((key, index) => <Bar key={key} dataKey={key} fill={colors[index]} radius={[5, 5, 0, 0]} />)}</BarChart></ResponsiveContainer>;
}
