import { CheckCircle2, ChevronRight, Code2, Database, Wrench } from "lucide-react";

type Details = { generatedSql?: string; toolsUsed?: string[]; columnsUsed?: string[]; execution?: { rowCount?: number; elapsedMs?: number; preview?: Array<Record<string, unknown>> }; stages?: Array<{ stage: string; detail: string; status: string }> };

export default function AnalysisDetails({ details }: { details: Details }) {
  return <details className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/40">
    <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold text-slate-200 marker:content-none"><span>Analysis Details</span><ChevronRight className="h-4 w-4 text-slate-500 transition-transform duration-200 group-open:rotate-90" /></summary>
    <div className="space-y-5 border-t border-slate-800 px-5 py-5 text-sm">
      <div className="grid gap-4 lg:grid-cols-3"><Info icon={<Wrench className="h-4 w-4" />} label="Tools used" value={details.toolsUsed?.join(" · ") || "—"} /><Info icon={<Database className="h-4 w-4" />} label="Columns referenced" value={details.columnsUsed?.join(", ") || "—"} /><Info icon={<CheckCircle2 className="h-4 w-4" />} label="Execution result" value={`${details.execution?.rowCount ?? 0} rows · ${details.execution?.elapsedMs ?? 0} ms`} /></div>
      <div><p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500"><Code2 className="h-3.5 w-3.5" />Generated SQL</p><pre className="overflow-auto rounded-xl border border-slate-800 bg-[#07111f] p-4 text-xs leading-6 text-cyan-200"><code>{details.generatedSql || "No SQL generated."}</code></pre></div>
      <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Analysis steps</p><div className="space-y-2">{details.stages?.map((stage, index) => <div className="flex gap-3 rounded-xl bg-slate-900/55 p-3" key={`${stage.stage}-${index}`}><span className="mt-0.5 text-xs font-bold text-blue-300">{String(index + 1).padStart(2, "0")}</span><div><p className="font-medium text-slate-200">{stage.stage}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{stage.detail}</p></div></div>)}</div></div>
    </div>
  </details>;
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3"><div className="flex items-center gap-2 text-xs text-slate-500">{icon}{label}</div><p className="mt-1.5 text-xs leading-5 text-slate-300">{value}</p></div>; }
