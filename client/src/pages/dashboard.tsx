import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import type { Assessment } from "@shared/schema";
import {
  ArrowRight, BarChart3, Settings, LogOut, Loader2
} from "lucide-react";

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user, logout, isLoading: authLoading } = useAuth();

  const { data: assessment, isLoading: assessmentLoading } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user,
  });

  useEffect(() => {
    document.title = "Dashboard | Electric Thinking";
  }, []);

  // Redirect to results if user has completed an assessment
  useEffect(() => {
    if (!assessmentLoading && assessment) {
      navigate("/results");
    }
  }, [assessment, assessmentLoading, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  // If still loading assessment, show spinner
  if (assessmentLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No assessment yet — show the start prompt
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <Wordmark className="text-lg" />
        <div className="flex items-center gap-2">
          {user.userRole === "system_admin" && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="link-admin">
              Admin
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Settings" data-testid="button-settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Log out" data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            <span className="ml-1">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-16">
        <Card className="rounded-2xl border border-border text-center">
          <CardContent className="pt-12 pb-12">
            <div className="w-16 h-16 rounded-2xl bg-et-pink/15 flex items-center justify-center mx-auto mb-6">
              <BarChart3 className="w-8 h-8 text-et-pink" />
            </div>
            <h2 className="font-heading text-2xl font-bold mb-3">
              Ready to discover your AI fluency?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Have a quick conversation with an AI that maps your skills across four levels.
            </p>
            <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/survey")} data-testid="button-start-assessment">
              Have a Conversation <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
