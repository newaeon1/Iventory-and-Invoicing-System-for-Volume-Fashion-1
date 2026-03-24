import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import LoginPage from "@/pages/LoginPage";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Layout from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <>
          <Route path="/" component={LoginPage} />
          <Route path="/login" component={LoginPage} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
        </>
      ) : (
        <>
          <Route path="/" component={() => <Layout page="dashboard" />} />
          <Route path="/products" component={() => <Layout page="products" />} />
          <Route path="/products/:id" component={() => <Layout page="product-detail" />} />
          <Route path="/add-product" component={() => <Layout page="add-product" />} />
          <Route path="/bulk-upload" component={() => <Layout page="bulk-upload" />} />
          <Route path="/invoices" component={() => <Layout page="invoices" />} />
          <Route path="/invoices/:id" component={() => <Layout page="invoice-detail" />} />
          <Route path="/create-invoice" component={() => <Layout page="create-invoice" />} />
          <Route path="/users" component={() => <Layout page="users" />} />
          <Route path="/activity-logs" component={() => <Layout page="activity-logs" />} />
          <Route path="/reports" component={() => <Layout page="reports" />} />
          <Route path="/customers" component={() => <Layout page="customers" />} />
          <Route path="/manufacturers" component={() => <Layout page="manufacturers" />} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
