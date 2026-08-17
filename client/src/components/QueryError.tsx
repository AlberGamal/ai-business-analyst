import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QueryError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-sm"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-400/10 text-red-300"><AlertTriangle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="font-medium text-red-100">This data could not be loaded</p><p className="mt-1 text-xs leading-5 text-red-200/65">{message || "Please retry. If the issue persists, refresh the page or sign in again."}</p></div>{onRetry && <Button variant="ghost" size="sm" onClick={onRetry} className="text-red-200 hover:bg-red-400/10 hover:text-red-100"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry</Button>}</div>;
}
