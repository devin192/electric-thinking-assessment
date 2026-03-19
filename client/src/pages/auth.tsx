import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.userRole === "system_admin") {
        navigate("/admin");
      } else if (!user.onboardingComplete) {
        navigate("/onboarding");
      } else {
        navigate("/dashboard");
      }
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
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
          <CardHeader className="text-center pb-2">
            <h1 className="font-heading text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your account</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="rounded-xl"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="rounded-xl"
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl py-5" disabled={loading} data-testid="button-login">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => navigate("/register")} className="text-et-blue underline" data-testid="link-register">
                Sign up
              </button>
            </div>
          </CardContent>
        </Card>
        <div className="text-center mt-6">
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground inline-flex items-center gap-1" data-testid="link-back-home">
            <ArrowLeft className="w-3 h-3" /> Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password, name);
      if (inviteToken) {
        navigate(`/join?token=${inviteToken}`);
      } else {
        navigate("/onboarding");
      }
    } catch (err: any) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
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
          <CardHeader className="text-center pb-2">
            <h1 className="font-heading text-2xl font-bold">Create your account</h1>
            <p className="text-muted-foreground text-sm mt-1">Start your AI fluency journey</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="rounded-xl"
                  data-testid="input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="rounded-xl"
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-xl"
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full rounded-2xl py-5" disabled={loading} data-testid="button-register">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground mt-4">
              By creating an account, you agree to our{" "}
              <a href="/terms" className="text-et-blue underline">Terms</a> and{" "}
              <a href="/privacy" className="text-et-blue underline">Privacy Policy</a>.
            </p>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="text-et-blue underline" data-testid="link-login">
                Sign in
              </button>
            </div>
          </CardContent>
        </Card>
        <div className="text-center mt-6">
          <button onClick={() => navigate("/")} className="text-sm text-muted-foreground inline-flex items-center gap-1" data-testid="link-back-home">
            <ArrowLeft className="w-3 h-3" /> Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
