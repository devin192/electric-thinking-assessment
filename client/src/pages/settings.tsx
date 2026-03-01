import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AiPlatform } from "@shared/schema";
import { ArrowLeft, Loader2, Save, Users } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [aiPlatform, setAiPlatform] = useState("");
  const [nudgesActive, setNudgesActive] = useState(true);
  const [nudgeDay, setNudgeDay] = useState("Monday");
  const [emailPrefsNudges, setEmailPrefsNudges] = useState(true);
  const [emailPrefsProgress, setEmailPrefsProgress] = useState(true);
  const [emailPrefsReminders, setEmailPrefsReminders] = useState(true);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setRoleTitle(user.roleTitle || "");
      setAiPlatform(user.aiPlatform || "");
      setNudgesActive(user.nudgesActive ?? true);
      setNudgeDay(user.nudgeDay || "Monday");
      setEmailPrefsNudges(user.emailPrefsNudges ?? true);
      setEmailPrefsProgress(user.emailPrefsProgress ?? true);
      setEmailPrefsReminders(user.emailPrefsReminders ?? true);
    }
  }, [user]);

  const { data: platforms } = useQuery<AiPlatform[]>({ queryKey: ["/api/platforms"] });

  const handleSave = async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/auth/me", {
        name, roleTitle, aiPlatform, nudgesActive, nudgeDay,
        emailPrefsNudges, emailPrefsProgress, emailPrefsReminders,
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
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-muted-foreground" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Wordmark className="text-lg" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(user.userRole === "manager" || user.userRole === "org_admin" || user.userRole === "system_admin") && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/manager")} data-testid="link-manager">
              <Users className="w-4 h-4 mr-1" />
              Team
            </Button>
          )}
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

        <Card className="rounded-2xl border border-border mb-6">
          <CardHeader className="pb-2">
            <h2 className="font-heading font-semibold">Notifications</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Learning Nudges</Label>
                <p className="text-xs text-muted-foreground">Receive weekly personalized learning tips</p>
              </div>
              <Switch checked={nudgesActive} onCheckedChange={setNudgesActive} data-testid="switch-nudges" />
            </div>
            <div className="space-y-2">
              <Label>Nudge Day</Label>
              <Select value={nudgeDay} onValueChange={setNudgeDay}>
                <SelectTrigger className="rounded-xl" data-testid="select-nudge-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-border mb-6">
          <CardHeader className="pb-2">
            <h2 className="font-heading font-semibold">Email Preferences</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Weekly nudge emails</Label>
                <p className="text-xs text-muted-foreground">Receive weekly learning nudges via email</p>
              </div>
              <Switch checked={emailPrefsNudges} onCheckedChange={setEmailPrefsNudges} data-testid="switch-email-nudges" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Progress updates</Label>
                <p className="text-xs text-muted-foreground">Skill complete, level up notifications</p>
              </div>
              <Switch checked={emailPrefsProgress} onCheckedChange={setEmailPrefsProgress} data-testid="switch-email-progress" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Reminders</Label>
                <p className="text-xs text-muted-foreground">Re-assessment, abandoned assessment reminders</p>
              </div>
              <Switch checked={emailPrefsReminders} onCheckedChange={setEmailPrefsReminders} data-testid="switch-email-reminders" />
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() => {
                setEmailPrefsNudges(false);
                setEmailPrefsProgress(false);
                setEmailPrefsReminders(false);
              }}
              data-testid="button-turn-off-all-emails"
            >
              Turn off all emails
            </button>
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
