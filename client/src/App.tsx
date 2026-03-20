import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/lib/protected-route";
import LandingPage from "@/pages/landing";
import { LoginPage, RegisterPage } from "@/pages/auth";
import OnboardingPage from "@/pages/onboarding";
import AssessmentWarmup from "@/pages/assessment-warmup";
import AssessmentPage from "@/pages/assessment";
import ResultsPage from "@/pages/results";
import DashboardPage from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import ManagerPage from "@/pages/manager";
import UnsubscribePage from "@/pages/unsubscribe";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import JoinPage from "@/pages/join";
import NotFound from "@/pages/not-found";
import ResetPasswordPage from "@/pages/reset-password";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/onboarding">{() => <ProtectedRoute><OnboardingPage /></ProtectedRoute>}</Route>
      <Route path="/assessment/warmup">{() => <ProtectedRoute><AssessmentWarmup /></ProtectedRoute>}</Route>
      <Route path="/assessment">{() => <ProtectedRoute><AssessmentPage /></ProtectedRoute>}</Route>
      <Route path="/results">{() => <ProtectedRoute><ResultsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard">{() => <ProtectedRoute><DashboardPage /></ProtectedRoute>}</Route>
      <Route path="/settings">{() => <ProtectedRoute><SettingsPage /></ProtectedRoute>}</Route>
      <Route path="/admin">{() => <ProtectedRoute><AdminPage /></ProtectedRoute>}</Route>
      <Route path="/manager">{() => <ProtectedRoute><ManagerPage /></ProtectedRoute>}</Route>
      <Route path="/unsubscribe/:token" component={UnsubscribePage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/join" component={JoinPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
