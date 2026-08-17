import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { Activity, BookMarked, BrainCircuit, Database, LayoutDashboard, LogOut, PanelLeft, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: BrainCircuit, label: "AI Analyst", path: "/analyst" },
  { icon: Database, label: "Dataset Explorer", path: "/datasets" },
  { icon: Activity, label: "Analysis History", path: "/history" },
  { icon: BookMarked, label: "Saved Insights", path: "/insights" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { loading, user, refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = trpc.auth.localLogin.useMutation({ onSuccess: () => refresh() });
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    await login.mutateAsync({ email, password });
  };
  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return <div className="min-h-screen grid place-items-center bg-[#07111f] px-5 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-slate-700/70 bg-slate-900/80 p-9 text-center shadow-2xl shadow-blue-950/40">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-blue-500/15 text-blue-300"><Sparkles className="h-7 w-7" /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Evidence Engine</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">AI Business Analyst</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Sign in with the local development account configured in your environment.</p>
        <form onSubmit={submitLogin} className="mt-7 space-y-3 text-left"><input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Developer email" className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-400" /><input required type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Local password" className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-blue-400" />{login.error && <p className="text-xs text-red-300">{login.error.message}</p>}<Button type="submit" disabled={login.isPending} className="h-11 w-full bg-blue-500 font-semibold text-white hover:bg-blue-400">{login.isPending ? "Signing in…" : "Continue locally"}</Button></form>
      </div>
    </div>;
  }
  return <SidebarProvider><DashboardContent>{children}</DashboardContent></SidebarProvider>;
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const active = menuItems.find(item => item.path === location)?.label ?? "AI Business Analyst";
  return <>
    <Sidebar collapsible="icon" className="border-r border-slate-800 bg-[#081420] text-slate-300">
      <SidebarHeader className="h-[84px] border-b border-slate-800 px-3 py-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-400 to-cyan-300 text-slate-950 shadow-lg shadow-blue-500/20"><Sparkles className="h-5 w-5" /></div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold text-white">Evidence Engine</p><p className="truncate text-[11px] text-slate-500">AI Business Analyst</p></div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 group-data-[collapsible=icon]:hidden">Workspace</p>
        <SidebarMenu>
          {menuItems.map(item => <SidebarMenuItem key={item.path}>
            <SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-10 text-slate-400 hover:bg-slate-800 hover:text-slate-100 data-[active=true]:bg-blue-500/15 data-[active=true]:text-blue-200">
              <item.icon className="h-4 w-4" /><span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>)}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-slate-800 p-3">
        <DropdownMenu><DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-xl p-1 text-left hover:bg-slate-800/80"><Avatar className="h-8 w-8 border border-slate-700"><AvatarFallback className="bg-slate-700 text-xs text-blue-100">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-xs font-medium text-slate-100">{user?.name || "Analyst"}</p><p className="truncate text-[10px] text-slate-500">Secure workspace</p></div></button>
        </DropdownMenuTrigger><DropdownMenuContent className="w-44"><DropdownMenuItem onClick={logout} className="text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-h-screen bg-[#07111f] text-slate-100">
      <header className="sticky top-0 z-30 flex h-[84px] items-center justify-between border-b border-slate-800 bg-[#07111f]/88 px-5 backdrop-blur-xl lg:px-8">
        <div className="flex items-center gap-3">{isMobile ? <SidebarTrigger className="border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" /> : <SidebarTrigger className="text-slate-500 hover:bg-slate-900 hover:text-slate-100" />}<div><p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-300">Workspace</p><h1 className="text-lg font-semibold tracking-tight text-white">{active}</h1></div></div>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Data-grounded mode</div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 p-5 lg:p-8">{children}</main>
    </SidebarInset>
  </>;
}
