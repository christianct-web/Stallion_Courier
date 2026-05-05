import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

const DeclarationsList = lazy(() => import("./pages/DeclarationsList"));
const StallionWorkbench = lazy(() => import("./pages/StallionWorkbench"));
const BrokerReview4 = lazy(() => import("./pages/BrokerReview4"));
const DocumentUpload = lazy(() => import("./pages/DocumentUpload"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const ClientsPage = lazy(() => import("./pages/Clients"));

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
            <Route path="/" element={<DeclarationsList />} />
            <Route path="/stallion/workbench" element={<StallionWorkbench />} />
            <Route path="/stallion/brokerreview4" element={<BrokerReview4 />} />
            <Route path="/stallion/extract" element={<DocumentUpload />} />
            <Route path="/stallion/log" element={<ActivityLog />} />
            <Route path="/stallion/clients" element={<ClientsPage />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
