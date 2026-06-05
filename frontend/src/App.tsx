import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const DeclarationsList = lazy(() => import("./pages/DeclarationsList"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const StallionShell = lazy(() => import("./components/StallionShell"));
const BrokerReview4 = lazy(() => import("./pages/BrokerReview4")); // legacy, off-nav
const StallionSheet = lazy(() => import("./pages/StallionSheet"));
const StallionSheetList = lazy(() => import("./pages/StallionSheetList"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const ClientsPage = lazy(() => import("./pages/Clients"));
const CourierManifests = lazy(() => import("./pages/CourierManifests"));
const CourierWorkbench = lazy(() => import("./pages/CourierWorkbench"));
const CourierExam = lazy(() => import("./pages/CourierExam"));
const CourierTariff = lazy(() => import("./pages/CourierTariff"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div style={{ padding: 24, fontFamily: "system-ui", color: "#666" }}>Loading…</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Dashboard is the landing page. Wrapped in StallionShell for nav. */}
            <Route element={<StallionShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/stallion/sheets" element={<StallionSheetList />} />
              <Route path="/stallion/sheet/:sheetId" element={<StallionSheet />} />
            </Route>
            {/* Full declarations list (was the old landing page). */}
            <Route path="/stallion/declarations" element={<DeclarationsList />} />
            {/* Legacy: kept only so the existing declarations stay openable.
                Off the nav. Remove once they have aged out / been migrated. */}
            <Route path="/stallion/brokerreview4" element={<BrokerReview4 />} />
            <Route path="/stallion/log" element={<ActivityLog />} />
            <Route path="/stallion/clients" element={<ClientsPage />} />
            <Route path="/stallion/courier" element={<CourierManifests />} />
            <Route path="/stallion/courier/tariff" element={<CourierTariff />} />
            <Route path="/stallion/courier/:manifestId" element={<CourierWorkbench />} />
            <Route path="/stallion/courier/:manifestId/exam" element={<CourierExam />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
