import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ErrorBoundary } from "@/components/error-boundary";
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
import UnsubscribePage from "@/pages/unsubscribe";
import LevelUpPage from "@/pages/level-up";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import JoinPage from "@/pages/join";
import NotFound from "@/pages/not-found";
import ResetPasswordPage from "@/pages/reset-password";
import SurveyPage from "@/pages/survey";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/onboarding">{() => <ProtectedRoute><OnboardingPage /></ProtectedRoute>}</Route>
      <Route path="/survey">{() => <ProtectedRoute><SurveyPage /></ProtectedRoute>}</Route>
      <Route path="/assessment/warmup">{() => <ProtectedRoute><AssessmentWarmup /></ProtectedRoute>}</Route>
      <Route path="/assessment">{() => <ProtectedRoute><AssessmentPage /></ProtectedRoute>}</Route>
      <Route path="/results">{() => <ProtectedRoute><ResultsPage /></ProtectedRoute>}</Route>
      <Route path="/dashboard">{() => <ProtectedRoute><DashboardPage /></ProtectedRoute>}</Route>
      <Route path="/settings">{() => <ProtectedRoute><SettingsPage /></ProtectedRoute>}</Route>
      <Route path="/admin">{() => <ProtectedRoute><AdminPage /></ProtectedRoute>}</Route>
      <Route path="/unsubscribe/:token" component={UnsubscribePage} />
      <Route path="/level-up" component={LevelUpPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/join/:code">{(params: any) => <JoinPage code={params.code} />}</Route>
      <Route path="/join">{() => <JoinPage />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <Toaster />
              <Router />
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}

export default App;
