import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AiPlatform } from "@shared/schema";
import { ArrowLeft, Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [aiPlatform, setAiPlatform] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setRoleTitle(user.roleTitle || "");
      setAiPlatform(user.aiPlatform || "");
    }
  }, [user]);

  const { data: platforms } = useQuery<AiPlatform[]>({ queryKey: ["/api/platforms"] });

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/auth/me", {
        name, roleTitle, aiPlatform,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground" aria-label="Back" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Wordmark className="text-lg" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {user.userRole === "system_admin" && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="link-admin">
              Admin
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-lg mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-6">Settings</h1>

        <Card className="rounded-2xl border border-border mb-6">
          <CardHeader className="pb-2">
            <h2 className="font-heading font-semibold">Profile</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="rounded-xl" data-testid="input-name" />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={roleTitle} onChange={e => setRoleTitle(e.target.value)} className="rounded-xl" data-testid="input-role" />
            </div>
            <div className="space-y-2">
              <Label>AI Platform</Label>
              <Select value={aiPlatform} onValueChange={setAiPlatform}>
                <SelectTrigger className="rounded-xl" data-testid="select-platform">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  {(platforms || []).filter(p => p.isActive).map(p => (
                    <SelectItem key={p.id} value={p.name}>{p.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full rounded-2xl py-5"
          onClick={handleSave}
          disabled={loading}
          data-testid="button-save-settings"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>Email: {user.email}</p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <a href="/privacy" className="text-et-blue underline">Privacy Policy</a>
            <a href="/terms" className="text-et-blue underline">Terms of Service</a>
          </div>
        </div>
      </div>
    </div>
  );
}
