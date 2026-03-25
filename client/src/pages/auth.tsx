import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail });
      setForgotSent(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
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
            <h1 className="font-heading text-2xl font-bold">
              {showForgotPassword ? "Reset your password" : "Welcome back"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {showForgotPassword
                ? "Enter your email and we'll send you a reset link"
                : "Sign in to your account"}
            </p>
          </CardHeader>
          <CardContent>
            {showForgotPassword ? (
              forgotSent ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
                  <h2 className="font-heading font-semibold text-lg mb-1">Check your email</h2>
                  <p className="text-sm text-muted-foreground mb-4">
                    If an account with that email exists, we sent a password reset link.
                  </p>
                  <Button
                    variant="outline"
                    className="rounded-2xl min-h-[44px]"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setForgotSent(false);
                      setForgotEmail("");
                    }}
                    data-testid="button-back-to-login"
                  >
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">Email</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="you@example.com"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                        className="rounded-xl"
                        data-testid="input-forgot-email"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full rounded-2xl min-h-[44px]"
                      disabled={forgotLoading}
                      data-testid="button-send-reset"
                    >
                      {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Send Reset Link
                    </Button>
                  </form>
                  <div className="mt-4 text-center">
                    <button
                      onClick={() => setShowForgotPassword(false)}
                      className="text-sm text-et-blue underline"
                      data-testid="link-back-to-login"
                    >
                      Back to sign in
                    </button>
                  </div>
                </>
              )
            ) : (
              <>
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotPassword(true);
                          setForgotEmail(email);
                        }}
                        className="text-xs text-et-pink hover:underline min-h-[44px] inline-flex items-center"
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    </div>
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
                  <button onClick={() => navigate("/register")} className="text-et-blue underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded" data-testid="link-register">
                    Sign up
                  </button>
                </div>
              </>
            )}
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
            <p className="text-muted-foreground text-sm mt-1">Free AI fluency assessment — takes under 15 minutes</p>
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
              <button onClick={() => navigate("/terms")} className="text-et-blue underline">Terms</button> and{" "}
              <button onClick={() => navigate("/privacy")} className="text-et-blue underline">Privacy Policy</button>.
            </p>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button onClick={() => navigate("/login")} className="text-et-blue underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded" data-testid="link-login">
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
