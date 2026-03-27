import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, ArrowRight, Loader2 } from "lucide-react";

export default function JoinPage({ code: routeCode }: { code?: string } = {}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const autoJoinAttempted = useRef(false);

  useEffect(() => { document.title = "Join Your Team — Electric Thinking"; }, []);

  // Set code from URL params (don't uppercase — may be a UUID invite token)
  useEffect(() => {
    const params = new URLSearchParams(search);
    const t = routeCode || params.get("token") || params.get("code") || "";
    if (t) setCode(t);
  }, [search, routeCode]);

  const doJoin = async (joinCode: string) => {
    setLoading(true);
    try {
      // Try reusable org join code first
      const joinRes = await fetch("/api/org/join-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: joinCode }),
      });

      if (joinRes.ok) {
        const data = await joinRes.json();
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        if (data.message?.includes("already")) {
          toast({ title: data.orgName ? `You're already in ${data.orgName}` : "You're already in this organization" });
        } else {
          toast({ title: data.orgName ? `Welcome to ${data.orgName}!` : "Welcome to the team!" });
        }
        // Navigate to onboarding if not completed, otherwise dashboard
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const me = await meRes.json();
        navigate(me?.onboardingComplete ? "/dashboard" : "/onboarding");
        return;
      }

      // If not found as org code, try as individual invite token (use original case)
      if (joinRes.status === 404) {
        await apiRequest("POST", "/api/invite/accept", { token: joinCode });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        toast({ title: "Welcome to the team!" });
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const me = await meRes.json();
        navigate(me?.onboardingComplete ? "/dashboard" : "/onboarding");
        return;
      }

      // Other error from join-code endpoint
      const errData = await joinRes.json().catch(() => ({ message: "Failed to join" }));
      toast({ title: "Error", description: errData.message, variant: "destructive" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({ title: "Enter a join code", variant: "destructive" });
      return;
    }

    if (!user) {
      navigate(`/register?invite=${trimmed}`);
      return;
    }

    await doJoin(trimmed);
  };

  // Auto-join after register: user arrives with code in URL and is now logged in
  useEffect(() => {
    if (user && code.trim() && !autoJoinAttempted.current && !loading) {
      const params = new URLSearchParams(search);
      const fromRegister = routeCode || params.get("token") || params.get("code");
      if (fromRegister) {
        autoJoinAttempted.current = true;
        doJoin(code.trim());
      }
    }
  }, [user, code]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Wordmark className="text-2xl" />
        </div>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-8 pb-8">
            <div className="w-14 h-14 rounded-2xl bg-et-blue/15 flex items-center justify-center mx-auto mb-6">
              <Users className="w-7 h-7 text-et-blue" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-center mb-3">
              Join Your Team
            </h1>
            <p className="text-muted-foreground text-center mb-6">
              {loading
                ? "Joining your team..."
                : user
                  ? "Enter the code from your team email to join."
                  : "Sign up first, then use your team code to join."}
            </p>
            <div className="space-y-4">
              <Input
                placeholder="Enter your team code"
                value={code}
                onChange={e => setCode(e.target.value)}
                className="rounded-xl text-center font-mono text-lg tracking-wider"
                data-testid="input-invite-token"
                onKeyDown={e => e.key === "Enter" && handleJoin()}
                disabled={loading}
              />
              <Button
                className="w-full rounded-2xl py-5"
                onClick={handleJoin}
                disabled={loading || !code.trim()}
                data-testid="button-join"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {user ? "Join Organization" : "Sign Up & Join"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="text-center mt-6">
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground inline-flex items-center gap-1">
            {"\u2190"} Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
