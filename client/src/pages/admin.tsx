import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Level, Skill, AssessmentQuestion, Assessment, AiPlatform, LiveSession } from "@shared/schema";
import {
  ArrowLeft, Users, BarChart3, Settings, MessageSquare, Layers,
  Save, Trash2, Plus, Eye, FileText, Clock, Loader2,
  Mail, Activity, Zap, Send, AlertTriangle, CheckCircle2,
  Video, Calendar, Link as LinkIcon
} from "lucide-react";

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!isLoading && (!user || user.userRole !== "system_admin")) {
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return null;
  if (!user || user.userRole !== "system_admin") return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <button onClick={() => navigate("/dashboard")} className="text-muted-foreground" data-testid="button-admin-back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wordmark className="text-lg" />
        <Badge variant="secondary" className="ml-2">Admin</Badge>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-6">Admin Panel</h1>

        <Tabs defaultValue="analytics" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="analytics" data-testid="tab-analytics"><BarChart3 className="w-4 h-4 mr-1" /> Analytics</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users"><Users className="w-4 h-4 mr-1" /> Users</TabsTrigger>
            <TabsTrigger value="skills" data-testid="tab-skills"><Layers className="w-4 h-4 mr-1" /> Skills</TabsTrigger>
            <TabsTrigger value="questions" data-testid="tab-questions"><MessageSquare className="w-4 h-4 mr-1" /> Questions</TabsTrigger>
            <TabsTrigger value="assessments" data-testid="tab-assessments"><FileText className="w-4 h-4 mr-1" /> Assessments</TabsTrigger>
            <TabsTrigger value="nudges" data-testid="tab-nudges"><Mail className="w-4 h-4 mr-1" /> Challenges</TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system"><Activity className="w-4 h-4 mr-1" /> System</TabsTrigger>
            <TabsTrigger value="sessions" data-testid="tab-sessions"><Video className="w-4 h-4 mr-1" /> Sessions</TabsTrigger>
            <TabsTrigger value="config" data-testid="tab-config"><Settings className="w-4 h-4 mr-1" /> Config</TabsTrigger>
          </TabsList>

          <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="skills"><SkillsTab /></TabsContent>
          <TabsContent value="questions"><QuestionsTab /></TabsContent>
          <TabsContent value="assessments"><AssessmentsTab /></TabsContent>
          <TabsContent value="nudges"><NudgesTab /></TabsContent>
          <TabsContent value="system"><SystemHealthTab /></TabsContent>
          <TabsContent value="sessions"><SessionsTab /></TabsContent>
          <TabsContent value="config"><ConfigTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const { data: analytics } = useQuery<{
    totalUsers: number; totalAssessments: number;
    completedAssessments: number; levelDistribution: Record<number, number>;
    skillCompletionRates: Record<number, { total: number; green: number; yellow: number; red: number }>;
    nudgeStats: { total: number; sent: number; opened: number; read: number };
  }>({ queryKey: ["/api/admin/analytics"] });

  const { data: skills } = useQuery<Skill[]>({ queryKey: ["/api/admin/skills"] });

  const LEVEL_NAMES: Record<number, string> = {
    0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized", 4: "Agentic"
  };

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-3xl font-bold text-et-pink">{analytics?.totalUsers ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-3xl font-bold text-et-blue">{analytics?.totalAssessments ?? 0}</p>
            <p className="text-sm text-muted-foreground">Total Assessments</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-3xl font-bold text-et-green">{analytics?.completedAssessments ?? 0}</p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {analytics?.completedAssessments ? (
        <Card className="rounded-2xl border border-border">
          <CardHeader><h3 className="font-heading font-semibold">Level Distribution</h3></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.levelDistribution || {}).map(([level, count]) => {
                const total = analytics.completedAssessments || 1;
                const pct = Math.round(((count as number) / total) * 100);
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className="text-sm w-28 shrink-0">L{Number(level) + 1} {LEVEL_NAMES[Number(level)] || ""}</span>
                    <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                      <div className="h-full bg-et-pink rounded-md" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm text-muted-foreground w-12 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid sm:grid-cols-4 gap-4">
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-2xl font-bold text-et-orange" data-testid="text-nudges-total">{analytics?.nudgeStats?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Challenges</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-2xl font-bold text-et-blue" data-testid="text-nudges-sent">{analytics?.nudgeStats?.sent ?? 0}</p>
            <p className="text-xs text-muted-foreground">Sent</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-2xl font-bold text-et-green" data-testid="text-nudges-opened">{analytics?.nudgeStats?.opened ?? 0}</p>
            <p className="text-xs text-muted-foreground">Opened</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="font-heading text-2xl font-bold text-et-pink" data-testid="text-nudges-read">{analytics?.nudgeStats?.read ?? 0}</p>
            <p className="text-xs text-muted-foreground">Read (In-App)</p>
          </CardContent>
        </Card>
      </div>

      {analytics?.skillCompletionRates && skills && Object.keys(analytics.skillCompletionRates).length > 0 && (
        <Card className="rounded-2xl border border-border">
          <CardHeader><h3 className="font-heading font-semibold">Skill Completion Rates</h3></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(analytics.skillCompletionRates).map(([skillId, rates]) => {
                const skill = skills?.find(s => s.id === parseInt(skillId));
                const total = rates.total || 1;
                return (
                  <div key={skillId} className="flex items-center gap-3">
                    <span className="text-xs w-36 shrink-0 truncate">{skill?.name || `Skill ${skillId}`}</span>
                    <div className="flex-1 h-5 bg-muted rounded-md overflow-hidden flex">
                      <div className="h-full bg-et-green" style={{ width: `${(rates.green / total) * 100}%` }} />
                      <div className="h-full bg-et-yellow" style={{ width: `${(rates.yellow / total) * 100}%` }} />
                      <div className="h-full bg-red-300" style={{ width: `${(rates.red / total) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                      {rates.green}G {rates.yellow}Y {rates.red}R
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NudgesTab() {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [deliverResult, setDeliverResult] = useState<any>(null);
  const [targetUserId, setTargetUserId] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const body = targetUserId ? { userId: parseInt(targetUserId) } : {};
      const res = await apiRequest("POST", "/api/admin/nudge/generate", body);
      const data = await res.json();
      setGenResult(data);
      toast({ title: "Challenge generation complete" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDeliver = async () => {
    setDelivering(true);
    setDeliverResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/nudge/deliver");
      const data = await res.json();
      setDeliverResult(data);
      toast({ title: "Challenge delivery complete" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDelivering(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Generate Challenges</h3></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate AI-powered learning challenges for users with active yellow skills.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="User ID (optional, blank = all users)"
              value={targetUserId}
              onChange={e => setTargetUserId(e.target.value)}
              className="rounded-xl w-64"
              data-testid="input-nudge-user-id"
            />
            <Button onClick={handleGenerate} disabled={generating} data-testid="button-generate-nudges">
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Zap className="w-4 h-4 mr-1" />}
              {targetUserId ? "Generate for User" : "Generate All"}
            </Button>
          </div>
          {genResult && (
            <div className="p-4 rounded-xl bg-accent/30 text-sm space-y-1" data-testid="nudge-gen-result">
              {genResult.generated !== undefined ? (
                <>
                  <p>Generated: <strong>{genResult.generated}</strong></p>
                  <p>Failed: <strong>{genResult.failed}</strong></p>
                  {genResult.errors?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-destructive font-medium">Errors:</p>
                      {genResult.errors.map((e: string, i: number) => (
                        <p key={i} className="text-xs text-destructive">{e}</p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p>Challenge created for user {targetUserId}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Deliver Challenges</h3></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Send all unsent challenges via email to users.
          </p>
          <Button onClick={handleDeliver} disabled={delivering} data-testid="button-deliver-nudges">
            {delivering ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
            Deliver Unsent Challenges
          </Button>
          {deliverResult && (
            <div className="p-4 rounded-xl bg-accent/30 text-sm space-y-1" data-testid="nudge-deliver-result">
              <p>Sent: <strong>{deliverResult.sent}</strong></p>
              <p>Failed: <strong>{deliverResult.failed}</strong></p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SystemHealthTab() {
  const { data: health } = useQuery<{
    cronJobs: {
      nudgeGeneration: { lastRun: string | null; lastResult: any };
      nudgeDelivery: { lastRun: string | null };
      dailyChecks: { lastRun: string | null };
      reassessmentReminders: { lastRun: string | null };
    };
    email: { recentSent: number; recentBounces: number; recentComplaints: number };
  }>({ queryKey: ["/api/admin/system-health"] });

  const { data: emailLogs } = useQuery<any[]>({ queryKey: ["/api/admin/email-logs"] });

  const formatTime = (ts: string | null) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString();
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Scheduled Jobs</h3></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: "Challenge Generation", data: health?.cronJobs?.nudgeGeneration },
              { name: "Challenge Delivery", data: health?.cronJobs?.nudgeDelivery },
              { name: "Daily Checks", data: health?.cronJobs?.dailyChecks },
              { name: "Re-Assessment Reminders", data: health?.cronJobs?.reassessmentReminders },
            ].map(job => (
              <div key={job.name} className="flex items-center justify-between p-3 rounded-xl bg-accent/30">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{job.name}</span>
                </div>
                <span className="text-xs text-muted-foreground" data-testid={`text-cron-${job.name.toLowerCase().replace(/\s+/g, "-")}`}>
                  {formatTime(job.data?.lastRun || null)}
                </span>
              </div>
            ))}
          </div>
          {health?.cronJobs?.nudgeGeneration?.lastResult && (
            <div className="mt-4 p-3 rounded-xl bg-accent/20 text-xs">
              <p className="font-medium mb-1">Last Generation Result:</p>
              <p>Generated: {health.cronJobs.nudgeGeneration.lastResult.generated}, Failed: {health.cronJobs.nudgeGeneration.lastResult.failed}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <CheckCircle2 className="w-6 h-6 text-et-green mx-auto mb-2" />
            <p className="font-heading text-2xl font-bold" data-testid="text-emails-sent">{health?.email?.recentSent ?? 0}</p>
            <p className="text-xs text-muted-foreground">Emails Sent</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <AlertTriangle className="w-6 h-6 text-et-orange mx-auto mb-2" />
            <p className="font-heading text-2xl font-bold" data-testid="text-emails-bounced">{health?.email?.recentBounces ?? 0}</p>
            <p className="text-xs text-muted-foreground">Bounces</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-border">
          <CardContent className="pt-6 pb-6 text-center">
            <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
            <p className="font-heading text-2xl font-bold" data-testid="text-emails-complaints">{health?.email?.recentComplaints ?? 0}</p>
            <p className="text-xs text-muted-foreground">Complaints</p>
          </CardContent>
        </Card>
      </div>

      {emailLogs && emailLogs.length > 0 && (
        <Card className="rounded-2xl border border-border">
          <CardHeader><h3 className="font-heading font-semibold">Recent Email Logs</h3></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {emailLogs.slice(0, 50).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-accent/20 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={log.event === "sent" ? "default" : log.event === "bounced" ? "destructive" : "secondary"} className="text-xs shrink-0">
                      {log.event}
                    </Badge>
                    <span className="truncate">{log.emailType} → {log.recipientEmail || `User ${log.userId}`}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const { data: users } = useQuery<any[]>({ queryKey: ["/api/admin/users"] });

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await apiRequest("PATCH", `/api/admin/users/${userId}`, { userRole: role });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (userId: number) => {
    if (!confirm("Are you sure you want to permanently delete this user and all their data?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleReset = async (userId: number) => {
    if (!confirm("This will clear all skill statuses for this user.")) return;
    try {
      await apiRequest("POST", `/api/admin/users/${userId}/reset`);
      toast({ title: "Progress reset" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      {(users || []).map(u => (
        <Card key={u.id} className="rounded-xl border border-border">
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{u.name || u.email}</div>
              <div className="text-xs text-muted-foreground">{u.email} · {u.roleTitle || "No title"}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={u.userRole} onValueChange={val => handleRoleChange(u.id, val)}>
                <SelectTrigger className="w-36 h-8 text-xs rounded-lg" data-testid={`select-role-${u.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="org_admin">Org Admin</SelectItem>
                  <SelectItem value="system_admin">System Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" onClick={() => handleReset(u.id)} data-testid={`button-reset-${u.id}`}>
                Reset
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(u.id)} data-testid={`button-delete-user-${u.id}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {(!users || users.length === 0) && (
        <p className="text-muted-foreground text-center py-8">No users yet</p>
      )}
    </div>
  );
}

function SkillsTab() {
  const { toast } = useToast();
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/admin/levels"] });
  const { data: skills } = useQuery<Skill[]>({ queryKey: ["/api/admin/skills"] });

  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const startEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setEditName(skill.name);
    setEditDesc(skill.description || "");
  };

  const saveSkill = async () => {
    if (!editingSkill) return;
    try {
      await apiRequest("PUT", `/api/admin/skills/${editingSkill.id}`, {
        name: editName, description: editDesc,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/skills"] });
      setEditingSkill(null);
      toast({ title: "Skill updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const skillsByLevel: Record<number, Skill[]> = {};
  (skills || []).forEach(s => {
    if (!skillsByLevel[s.levelId]) skillsByLevel[s.levelId] = [];
    skillsByLevel[s.levelId].push(s);
  });

  return (
    <div className="space-y-6">
      {(levels || []).map(level => (
        <Card key={level.id} className="rounded-2xl border border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <span className="font-heading font-semibold">Level {level.sortOrder + 1}: {level.displayName}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(skillsByLevel[level.id] || []).map(skill => (
                <div key={skill.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-accent/30">
                  {editingSkill?.id === skill.id ? (
                    <div className="flex-1 space-y-2">
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-lg" />
                      <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="rounded-lg" placeholder="Description" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveSkill}><Save className="w-3 h-3 mr-1" /> Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingSkill(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{skill.name}</div>
                        <div className="text-xs text-muted-foreground">{skill.description}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(skill)}>Edit</Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuestionsTab() {
  const { toast } = useToast();
  const { data: questions } = useQuery<AssessmentQuestion[]>({ queryKey: ["/api/admin/questions"] });
  const { data: skills } = useQuery<Skill[]>({ queryKey: ["/api/admin/skills"] });

  const [newQuestion, setNewQuestion] = useState("");
  const [newSkillId, setNewSkillId] = useState("");

  const addQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      await apiRequest("POST", "/api/admin/questions", {
        questionText: newQuestion,
        skillId: newSkillId ? parseInt(newSkillId) : null,
        sortOrder: (questions?.length || 0) + 1,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/questions"] });
      setNewQuestion("");
      toast({ title: "Question added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteQuestion = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/admin/questions/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/questions"] });
      toast({ title: "Question deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Add Question</h3></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Enter assessment question..."
            className="rounded-xl"
            data-testid="input-new-question"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={newSkillId} onValueChange={setNewSkillId}>
              <SelectTrigger className="w-48 rounded-lg" data-testid="select-question-skill">
                <SelectValue placeholder="Link to skill (optional)" />
              </SelectTrigger>
              <SelectContent>
                {(skills || []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addQuestion} data-testid="button-add-question">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(questions || []).map((q, i) => (
          <Card key={q.id} className="rounded-xl border border-border">
            <CardContent className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{q.questionText}</p>
                {q.skillId && (
                  <Badge variant="secondary" className="mt-1 text-xs">
                    {skills?.find(s => s.id === q.skillId)?.name || `Skill ${q.skillId}`}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={() => deleteQuestion(q.id)} data-testid={`button-delete-q-${q.id}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {(!questions || questions.length === 0) && (
          <p className="text-muted-foreground text-center py-8">No questions yet. Add your 27 assessment questions above.</p>
        )}
      </div>
    </div>
  );
}

function AssessmentsTab() {
  const { toast } = useToast();
  const { data: assessments } = useQuery<Assessment[]>({ queryKey: ["/api/admin/assessments"] });
  const { data: users } = useQuery<any[]>({ queryKey: ["/api/admin/users"] });
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { data: viewingAssessment } = useQuery<Assessment>({
    queryKey: ["/api/admin/assessments", viewingId],
    enabled: viewingId !== null,
  });

  const deleteAssessment = async (id: number) => {
    if (!confirm("Delete this assessment? This will reset the user's skill statuses.")) return;
    try {
      await apiRequest("DELETE", `/api/admin/assessments/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assessments"] });
      toast({ title: "Assessment deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getUserName = (userId: number) => {
    const u = users?.find(u => u.id === userId);
    return u?.name || u?.email || `User ${userId}`;
  };

  return (
    <div className="space-y-3">
      {(assessments || []).map(a => (
        <Card key={a.id} className="rounded-xl border border-border">
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="font-medium text-sm">{getUserName(a.userId)}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <Badge variant={a.status === "completed" ? "default" : "secondary"} className="text-xs">
                  {a.status}
                </Badge>
                {a.assessmentLevel !== null && <span>Level {a.assessmentLevel + 1}</span>}
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(a.startedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={() => setViewingId(a.id)} data-testid={`button-view-${a.id}`}>
                    <Eye className="w-4 h-4 mr-1" /> View
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Assessment Transcript</DialogTitle>
                  </DialogHeader>
                  {viewingAssessment && (
                    <div className="space-y-4">
                      {viewingAssessment.contextSummary && (
                        <div className="p-4 rounded-xl bg-accent/30">
                          <p className="text-xs font-medium mb-1">Context Summary</p>
                          <p className="text-sm text-muted-foreground">{viewingAssessment.contextSummary}</p>
                        </div>
                      )}
                      {viewingAssessment.scoresJson && (
                        <div className="p-4 rounded-xl bg-accent/30">
                          <p className="text-xs font-medium mb-2">Scores</p>
                          <div className="space-y-1">
                            {Object.entries(viewingAssessment.scoresJson as Record<string, any>).map(([name, data]: [string, any]) => (
                              <div key={name} className="flex items-center justify-between text-xs gap-2">
                                <span className="truncate">{name}</span>
                                <Badge variant="secondary" className={`text-xs shrink-0 ${
                                  data.status === 'green' ? 'bg-et-green/20 text-et-green' :
                                  data.status === 'yellow' ? 'bg-et-yellow/20 text-et-orange' :
                                  'bg-muted'
                                }`}>{data.status}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-3">
                        <p className="text-xs font-medium">Transcript</p>
                        {(() => {
                          try {
                            const msgs = JSON.parse(viewingAssessment.transcript || "[]");
                            return msgs.map((m: any, i: number) => (
                              <div key={i} className={`text-sm p-3 rounded-xl ${m.role === 'user' ? 'bg-et-pink/5 ml-8' : 'bg-accent/30 mr-8'}`}>
                                <p className="text-xs font-medium mb-1 capitalize">{m.role}</p>
                                <p className="text-muted-foreground leading-relaxed">{m.content}</p>
                              </div>
                            ));
                          } catch { return <p className="text-sm text-muted-foreground">No transcript available</p>; }
                        })()}
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="icon" onClick={() => deleteAssessment(a.id)} data-testid={`button-delete-assessment-${a.id}`}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {(!assessments || assessments.length === 0) && (
        <p className="text-muted-foreground text-center py-8">No assessments yet</p>
      )}
    </div>
  );
}

function ConfigTab() {
  const { toast } = useToast();
  const [saving, setSaving] = useState("");

  const { data: assessmentGuide } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/admin/config", "assessment_conversation_guide"],
  });
  const { data: elevenLabsConfig } = useQuery<{ key: string; value: string }>({
    queryKey: ["/api/admin/config", "elevenlabs_agent_id"],
  });
  const { data: nudgeGuide } = useQuery<{ text: string }>({
    queryKey: ["/api/admin/nudge-guide"],
  });
  const { data: platforms } = useQuery<AiPlatform[]>({ queryKey: ["/api/admin/platforms"] });

  const [guideText, setGuideText] = useState("");
  const [nudgeText, setNudgeText] = useState("");
  const [agentId, setAgentId] = useState("");
  const [newPlatform, setNewPlatform] = useState("");
  const [guideLoaded, setGuideLoaded] = useState(false);
  const [nudgeLoaded, setNudgeLoaded] = useState(false);
  const [agentIdLoaded, setAgentIdLoaded] = useState(false);

  if (assessmentGuide?.value && !guideLoaded) {
    setGuideText(assessmentGuide.value);
    setGuideLoaded(true);
  }
  if (nudgeGuide?.text && !nudgeLoaded) {
    setNudgeText(nudgeGuide.text);
    setNudgeLoaded(true);
  }
  if (elevenLabsConfig?.value && !agentIdLoaded) {
    setAgentId(elevenLabsConfig.value);
    setAgentIdLoaded(true);
  }

  const saveGuide = async () => {
    setSaving("guide");
    try {
      await apiRequest("PUT", "/api/admin/config/assessment_conversation_guide", { value: guideText || assessmentGuide?.value });
      toast({ title: "Assessment guide saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving("");
  };

  const saveNudge = async () => {
    setSaving("nudge");
    try {
      await apiRequest("PUT", "/api/admin/nudge-guide", { text: nudgeText || nudgeGuide?.text });
      toast({ title: "Challenge guide saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving("");
  };

  const saveAgentId = async () => {
    setSaving("agentId");
    try {
      await apiRequest("PUT", "/api/admin/config/elevenlabs_agent_id", { value: agentId.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config", "elevenlabs_agent_id"] });
      toast({ title: "ElevenLabs Agent ID saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving("");
  };

  const addPlatform = async () => {
    if (!newPlatform.trim()) return;
    try {
      await apiRequest("POST", "/api/admin/platforms", {
        name: newPlatform.toLowerCase().replace(/\s+/g, "_"),
        displayName: newPlatform,
        sortOrder: (platforms?.length || 0) + 1,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platforms"] });
      setNewPlatform("");
      toast({ title: "Platform added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deletePlatform = async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/admin/platforms/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platforms"] });
      toast({ title: "Platform removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Assessment Conversation Guide</h3></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={guideText || assessmentGuide?.value || ""}
            onChange={e => setGuideText(e.target.value)}
            className="rounded-xl min-h-[200px] font-mono text-xs"
            data-testid="input-assessment-guide"
          />
          <Button onClick={saveGuide} disabled={saving === "guide"} data-testid="button-save-guide">
            {saving === "guide" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Guide
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Challenge Voice Guide</h3></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={nudgeText || nudgeGuide?.text || ""}
            onChange={e => setNudgeText(e.target.value)}
            className="rounded-xl min-h-[120px] font-mono text-xs"
            data-testid="input-nudge-guide"
          />
          <Button onClick={saveNudge} disabled={saving === "nudge"} data-testid="button-save-nudge">
            {saving === "nudge" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Guide
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">ElevenLabs Voice Assessment</h3></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the Agent ID from your ElevenLabs Conversational AI dashboard to enable voice assessments.
          </p>
          <Input
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            placeholder="e.g. agent_abc123..."
            className="rounded-lg font-mono text-sm"
            data-testid="input-elevenlabs-agent-id"
          />
          <Button onClick={saveAgentId} disabled={saving === "agentId"} data-testid="button-save-agent-id">
            {saving === "agentId" ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Save Agent ID
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">AI Platforms</h3></CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            {(platforms || []).map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-accent/30">
                <span className="text-sm font-medium">{p.displayName}</span>
                <Button variant="ghost" size="icon" onClick={() => deletePlatform(p.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newPlatform}
              onChange={e => setNewPlatform(e.target.value)}
              placeholder="New platform name"
              className="rounded-lg"
              data-testid="input-new-platform"
            />
            <Button onClick={addPlatform} data-testid="button-add-platform">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader><h3 className="font-heading font-semibold">Organizations</h3></CardHeader>
        <CardContent>
          <OrganizationsList />
        </CardContent>
      </Card>
    </div>
  );
}

function SessionsTab() {
  const { toast } = useToast();
  const { data: sessions } = useQuery<LiveSession[]>({ queryKey: ["/api/admin/sessions"] });
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/admin/levels"] });
  const [showForm, setShowForm] = useState(false);
  const [editingSession, setEditingSession] = useState<LiveSession | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [recordingLink, setRecordingLink] = useState("");
  const [levelId, setLevelId] = useState("");

  const resetForm = () => {
    setTitle(""); setDescription(""); setSessionDate(""); setJoinLink(""); setRecordingLink(""); setLevelId("");
    setEditingSession(null); setShowForm(false);
  };

  const startEdit = (s: LiveSession) => {
    setEditingSession(s);
    setTitle(s.title);
    setDescription(s.description || "");
    setSessionDate(new Date(s.sessionDate).toISOString().slice(0, 16));
    setJoinLink(s.joinLink || "");
    setRecordingLink(s.recordingLink || "");
    setLevelId(String(s.levelId));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!title || !sessionDate || !levelId) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    try {
      const body = {
        title, description: description || null,
        sessionDate: new Date(sessionDate).toISOString(),
        joinLink: joinLink || null, recordingLink: recordingLink || null,
        levelId: parseInt(levelId),
      };
      if (editingSession) {
        await apiRequest("PUT", `/api/admin/sessions/${editingSession.id}`, body);
        toast({ title: "Session updated" });
      } else {
        await apiRequest("POST", "/api/admin/sessions", body);
        toast({ title: "Session created" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      resetForm();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this session?")) return;
    try {
      await apiRequest("DELETE", `/api/admin/sessions/${id}`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sessions"] });
      toast({ title: "Session deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getLevelName = (id: number) => levels?.find(l => l.id === id)?.displayName || `Level ${id}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold">Live Sessions</h3>
        <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-session">
          <Plus className="w-4 h-4 mr-1" /> Add Session
        </Button>
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editingSession ? "Edit Session" : "New Session"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} className="rounded-xl" data-testid="input-session-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} className="rounded-xl" data-testid="input-session-desc" />
            </div>
            <div>
              <Label>Date & Time *</Label>
              <Input type="datetime-local" value={sessionDate} onChange={e => setSessionDate(e.target.value)} className="rounded-xl" data-testid="input-session-date" />
            </div>
            <div>
              <Label>Level *</Label>
              <Select value={levelId} onValueChange={setLevelId}>
                <SelectTrigger className="rounded-xl" data-testid="select-session-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  {(levels || []).map(l => (
                    <SelectItem key={l.id} value={String(l.id)}>L{l.sortOrder + 1}: {l.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Join Link</Label>
              <Input value={joinLink} onChange={e => setJoinLink(e.target.value)} className="rounded-xl" placeholder="https://zoom.us/..." data-testid="input-session-join" />
            </div>
            <div>
              <Label>Recording Link</Label>
              <Input value={recordingLink} onChange={e => setRecordingLink(e.target.value)} className="rounded-xl" placeholder="https://..." data-testid="input-session-recording" />
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={handleSave} data-testid="button-save-session">
                <Save className="w-4 h-4 mr-1" /> {editingSession ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        {(sessions || []).map(s => {
          const isPast = new Date(s.sessionDate) < new Date();
          return (
            <Card key={s.id} className="rounded-xl border border-border">
              <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {s.title}
                    <Badge variant={isPast ? "secondary" : "default"} className="text-xs">
                      {isPast ? "Past" : "Upcoming"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(s.sessionDate).toLocaleString()}</span>
                    <span>{getLevelName(s.levelId)}</span>
                    {s.joinLink && <a href={s.joinLink} target="_blank" rel="noreferrer" className="text-et-pink flex items-center gap-1"><LinkIcon className="w-3 h-3" />Join</a>}
                    {s.recordingLink && <a href={s.recordingLink} target="_blank" rel="noreferrer" className="text-et-blue flex items-center gap-1"><Video className="w-3 h-3" />Recording</a>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(s)} data-testid={`button-edit-session-${s.id}`}>Edit</Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)} data-testid={`button-delete-session-${s.id}`}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(!sessions || sessions.length === 0) && (
          <p className="text-muted-foreground text-center py-8">No live sessions yet</p>
        )}
      </div>
    </div>
  );
}

function OrganizationsList() {
  const { data: orgs } = useQuery<any[]>({ queryKey: ["/api/admin/organizations"] });

  return (
    <div className="space-y-2">
      {(orgs || []).map(org => (
        <div key={org.id} className="flex items-center justify-between p-3 rounded-xl bg-accent/30">
          <div>
            <div className="text-sm font-medium">{org.name}</div>
            <div className="text-xs text-muted-foreground">{org.industry || "No industry"} · {org.size || "Unknown size"}</div>
          </div>
        </div>
      ))}
      {(!orgs || orgs.length === 0) && (
        <p className="text-sm text-muted-foreground">No organizations yet</p>
      )}
    </div>
  );
}
