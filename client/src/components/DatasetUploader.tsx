import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export default function DatasetUploader({ onUploaded }: { onUploaded: (datasetId: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const upload = trpc.datasets.upload.useMutation({ onSuccess: data => { toast.success("Dataset profiled and ready for analysis."); onUploaded(data.datasetId); setFilename(null); if (inputRef.current) inputRef.current.value = ""; }, onError: error => toast.error(error.message) });
  const readFile = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(file); });
  const handle = async (file?: File) => {
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) { toast.error("Choose a CSV or XLSX file."); return; }
    setFilename(file.name);
    try { const base64 = await readFile(file); upload.mutate({ filename: file.name, mimeType: file.type || "application/octet-stream", base64 }); }
    catch { toast.error("The file could not be read in this browser."); setFilename(null); }
  };
  return <div className="rounded-2xl border border-dashed border-blue-400/30 bg-blue-400/[0.035] p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500/15 text-blue-300"><FileSpreadsheet className="h-5 w-5" /></div><div><p className="text-sm font-semibold text-slate-100">Bring your own dataset</p><p className="mt-0.5 text-xs text-slate-500">CSV or XLSX · up to 4 MB · secure to your workspace</p></div></div><Input ref={inputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={event => handle(event.target.files?.[0])} /><Button onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="bg-blue-500 text-white hover:bg-blue-400">{upload.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Profiling…</> : <><UploadCloud className="mr-2 h-4 w-4" />Upload data</>}</Button></div>
    {filename && <p className="mt-4 truncate text-xs text-blue-200">Preparing {filename}</p>}
  </div>;
}
