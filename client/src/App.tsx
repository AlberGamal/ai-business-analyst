import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Analyst from "./pages/Analyst";
import AnalysisHistory from "./pages/AnalysisHistory";
import DatasetExplorer from "./pages/DatasetExplorer";
import NotFound from "./pages/NotFound";
import Overview from "./pages/Overview";
import SavedInsights from "./pages/SavedInsights";

function Router() {
  return <DashboardLayout><Switch>
    <Route path="/" component={Overview} />
    <Route path="/analyst" component={Analyst} />
    <Route path="/datasets" component={DatasetExplorer} />
    <Route path="/history" component={AnalysisHistory} />
    <Route path="/insights" component={SavedInsights} />
    <Route path="/404" component={NotFound} />
    <Route component={NotFound} />
  </Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster richColors theme="dark" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
