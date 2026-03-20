import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords match.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      setSuccess(true);
    } catch (err: any) {
      setError("Invalid or expired reset link. Please request a new one.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <Wordmark className="text-2xl mb-8" />
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2">Invalid reset link</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This password reset link is not valid. Please request a new one from the login page.
          </p>
          <Button
            className="rounded-2xl min-h-[44px]"
            onClick={() => navigate("/login")}
            data-testid="button-go-to-login"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <Wordmark className="text-2xl mb-8" />
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2" data-testid="text-reset-success">
            Password reset successfully
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Button
            className="rounded-2xl min-h-[44px]"
            onClick={() => navigate("/login")}
            data-testid="button-go-to-login"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Wordmark className="text-2xl" />
        </div>
        <Card className="rounded-2xl border border-border">
          <CardHeader className="text-center pb-2">
            <h1 className="font-heading text-2xl font-bold">Choose a new password</h1>
            <p className="text-muted-foreground text-sm mt-1">Enter your new password below</p>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span data-testid="text-reset-error">{error}</span>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-xl"
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="rounded-xl"
                  data-testid="input-confirm-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-2xl min-h-[44px]"
                disabled={loading}
                data-testid="button-reset-password"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Reset Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
