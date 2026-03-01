import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      <Route path="/assessment/warmup" component={AssessmentWarmup} />
      <Route path="/assessment" component={AssessmentPage} />
      <Route path="/results" component={ResultsPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route path="/manager" component={ManagerPage} />
      <Route path="/unsubscribe/:token" component={UnsubscribePage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
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
