import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/wordmark";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react";

interface UnsubscribePrefs {
  email: string;
  emailPrefsNudges: boolean;
  emailPrefsProgress: boolean;
  emailPrefsReminders: boolean;
}

export default function UnsubscribePage() {
  const [, params] = useRoute("/unsubscribe/:token");
  const token = params?.token;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [emailPrefsNudges, setEmailPrefsNudges] = useState(true);
  const [emailPrefsProgress, setEmailPrefsProgress] = useState(true);
  const [emailPrefsReminders, setEmailPrefsReminders] = useState(true);
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!token) return;
    const fetchPrefs = async () => {
      try {
        const res = await fetch(`/api/unsubscribe/${token}`, { credentials: "include" });
        if (!res.ok) {
          setError("Invalid or expired link");
          setLoading(false);
          return;
        }
        const data: UnsubscribePrefs = await res.json();
        setEmail(data.email);
        setEmailPrefsNudges(data.emailPrefsNudges);
        setEmailPrefsProgress(data.emailPrefsProgress);
        setEmailPrefsReminders(data.emailPrefsReminders);
        setLoading(false);
      } catch {
        setError("Invalid or expired link");
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await apiRequest("POST", `/api/unsubscribe/${token}`, {
        emailPrefsNudges,
        emailPrefsProgress,
        emailPrefsReminders,
      });
      setSaved(true);
      toast({ title: "Preferences updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleUnsubscribeAll = () => {
    setEmailPrefsNudges(false);
    setEmailPrefsProgress(false);
    setEmailPrefsReminders(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 px-6 py-4">
          <Wordmark className="text-lg" />
        </header>
        <div className="max-w-md mx-auto px-6 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2" data-testid="text-error-title">Invalid or expired link</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-error-description">
            This unsubscribe link is no longer valid. Please check your email for a more recent link, or update your preferences in your account settings.
          </p>
        </div>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border/50 px-6 py-4">
          <Wordmark className="text-lg" />
        </header>
        <div className="max-w-md mx-auto px-6 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h1 className="font-heading text-xl font-bold mb-2" data-testid="text-success-title">Your preferences have been updated</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-success-description">
            Your email preferences for {email} have been saved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4">
        <Wordmark className="text-lg" />
      </header>

      <div className="max-w-md mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-2" data-testid="text-page-title">Email Preferences</h1>
        <p className="text-sm text-muted-foreground mb-6" data-testid="text-email-display">
          Managing preferences for {email}
        </p>

        <Card className="rounded-2xl border border-border mb-6">
          <CardHeader className="pb-2">
            <h2 className="font-heading font-semibold">Email Notifications</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Weekly learning nudges</Label>
                <p className="text-xs text-muted-foreground">Personalized tips to build your AI skills</p>
              </div>
              <Switch
                checked={emailPrefsNudges}
                onCheckedChange={setEmailPrefsNudges}
                data-testid="switch-nudges"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Progress updates</Label>
                <p className="text-xs text-muted-foreground">Skill complete and level up notifications</p>
              </div>
              <Switch
                checked={emailPrefsProgress}
                onCheckedChange={setEmailPrefsProgress}
                data-testid="switch-progress"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Reminders</Label>
                <p className="text-xs text-muted-foreground">Re-assessment and abandoned assessment reminders</p>
              </div>
              <Switch
                checked={emailPrefsReminders}
                onCheckedChange={setEmailPrefsReminders}
                data-testid="switch-reminders"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            className="w-full rounded-2xl"
            onClick={handleSave}
            disabled={saving}
            data-testid="button-save-preferences"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Preferences
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-2xl"
            onClick={handleUnsubscribeAll}
            data-testid="button-unsubscribe-all"
          >
            Unsubscribe from all
          </Button>
        </div>
      </div>
    </div>
  );
}