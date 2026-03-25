import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, ArrowRight, Loader2 } from "lucide-react";

export default function JoinPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();

  useEffect(() => { document.title = "Join Your Team — Electric Thinking"; }, []);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const t = params.get("token");
    if (t) setToken(t);
  }, [search]);

  const handleJoin = async () => {
    if (!token.trim()) {
      toast({ title: "Enter an invite token", variant: "destructive" });
      return;
    }

    if (!user) {
      navigate(`/register?invite=${token}`);
      return;
    }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/invite/accept", { token });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Welcome to the team!" });
      navigate("/dashboard");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
              {user
                ? "Enter your invite token to join your organization."
                : "Sign up first, then use your invite token to join."}
            </p>
            <div className="space-y-4">
              <Input
                placeholder="Paste the code from your invite email"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="rounded-xl"
                data-testid="input-invite-token"
              />
              <Button
                className="w-full rounded-2xl py-5"
                onClick={handleJoin}
                disabled={loading || !token.trim()}
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
