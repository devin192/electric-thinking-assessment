import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Wordmark } from "@/components/wordmark";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Users, BarChart3, AlertTriangle, Activity,
  Download, ChevronDown, ChevronUp, Loader2
} from "lucide-react";

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-et-cyan", 1: "bg-et-gold", 2: "bg-et-pink", 3: "bg-et-orange", 4: "bg-et-blue",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized", 4: "Agentic",
};

type TeamMember = {
  id: number;
  name: string;
  email: string;
  roleTitle: string;
  userRole: string;
  nudgesActive: boolean;
  assessmentLevel: number | null;
  skillStatuses: { skillId: number; skillName?: string; status: string; completedAt: string | null }[];
  lastAssessment: string | null;
};

type TeamMemberDetail = {
  id: number;
  name: string;
  email: string;
  roleTitle: string;
  nudgesActive: boolean;
  skillStatuses: { skillId: number; skillName?: string; status: string; completedAt: string | null }[];
  badges: { id: number; badgeType: string; badgeDataJson: Record<string, any>; earnedAt: string }[];
};

type Analytics = {
  levelDistribution: Record<number, number>;
  memberCount: number;
  skillGaps: { skillId: number; skillName: string; redCount: number }[];
};

type ActivityItem = {
  id: number;
  orgId: number | null;
  userId: number | null;
  eventType: string;
  eventDataJson: Record<string, any> | null;
  createdAt: string;
  userName: string;
};

export default function ManagerPage() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  if (isLoading) return null;
  if (!user || !["manager", "org_admin", "system_admin"].includes(user.userRole)) {
    navigate("/dashboard");
    return null;
  }

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/manager/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "team-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <button onClick={() => navigate("/dashboard")} className="text-muted-foreground" data-testid="button-manager-back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wordmark className="text-lg" />
        <Badge variant="secondary" className="ml-2">Manager</Badge>
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
            data-testid="button-export-csv"
          >
            {exporting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            Export CSV
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="font-heading text-2xl font-bold mb-6">Team Dashboard</h1>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-1" /> Overview
            </TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">
              <Users className="w-4 h-4 mr-1" /> Members
            </TabsTrigger>
            <TabsTrigger value="gaps" data-testid="tab-gaps">
              <AlertTriangle className="w-4 h-4 mr-1" /> Gaps
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="w-4 h-4 mr-1" /> Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="members"><MembersTab /></TabsContent>
          <TabsContent value="gaps"><GapsTab /></TabsContent>
          <TabsContent value="activity"><ActivityTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OverviewTab() {
  const { data: analytics } = useQuery<Analytics>({ queryKey: ["/api/manager/analytics"] });

  const totalMembers = analytics?.memberCount ?? 0;
  const dist = analytics?.levelDistribution || {};
  const maxCount = Math.max(...Object.values(dist), 1);

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border border-border">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="font-heading text-3xl font-bold text-et-pink" data-testid="text-member-count">{totalMembers}</p>
          <p className="text-sm text-muted-foreground">Team Members</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-border">
        <CardHeader>
          <h3 className="font-heading font-semibold">Level Distribution</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map(level => {
              const count = dist[level] || 0;
              const pct = totalMembers > 0 ? Math.round((count / totalMembers) * 100) : 0;
              return (
                <div key={level} className="flex items-center gap-3" data-testid={`bar-level-${level}`}>
                  <div className="flex items-center gap-2 w-32 shrink-0">
                    <div className={`w-6 h-6 rounded-md ${LEVEL_COLORS[level]} flex items-center justify-center text-white font-heading font-bold text-xs`}>
                      {level + 1}
                    </div>
                    <span className="text-sm truncate">{LEVEL_NAMES[level]}</span>
                  </div>
                  <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                    <div
                      className={`h-full ${LEVEL_COLORS[level]} rounded-md transition-all`}
                      style={{ width: `${totalMembers > 0 ? (count / maxCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-16 text-right shrink-0">{count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MembersTab() {
  const { toast } = useToast();
  const { data: team, isLoading } = useQuery<TeamMember[]>({ queryKey: ["/api/manager/team"] });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: memberDetail } = useQuery<TeamMemberDetail>({
    queryKey: ["/api/manager/team", expandedId],
    enabled: expandedId !== null,
  });

  const toggleNudges = async (memberId: number, current: boolean) => {
    try {
      await apiRequest("PATCH", `/api/manager/team/${memberId}/nudges`, { nudgesActive: !current });
      queryClient.invalidateQueries({ queryKey: ["/api/manager/team"] });
      toast({ title: `Power Ups ${!current ? "enabled" : "disabled"}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(team || []).map(member => {
        const greenCount = member.skillStatuses.filter(s => s.status === "green").length;
        const yellowCount = member.skillStatuses.filter(s => s.status === "yellow").length;
        const redCount = member.skillStatuses.filter(s => s.status === "red").length;
        const isExpanded = expandedId === member.id;

        return (
          <Card key={member.id} className="rounded-2xl border border-border" data-testid={`card-member-${member.id}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  {member.assessmentLevel !== null && (
                    <div className={`w-8 h-8 rounded-md ${LEVEL_COLORS[member.assessmentLevel] || "bg-muted"} flex items-center justify-center text-white font-heading font-bold text-xs shrink-0`}>
                      {member.assessmentLevel + 1}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{member.name || member.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.roleTitle || "Member"} · {member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="bg-et-green/15 text-et-green text-xs">{greenCount}</Badge>
                    <Badge variant="secondary" className="bg-et-yellow/15 text-et-orange text-xs">{yellowCount}</Badge>
                    <Badge variant="secondary" className="bg-destructive/15 text-destructive text-xs">{redCount}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Power Ups</span>
                    <Switch
                      checked={member.nudgesActive}
                      onCheckedChange={() => toggleNudges(member.id, member.nudgesActive)}
                      data-testid={`switch-nudges-${member.id}`}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpandedId(isExpanded ? null : member.id)}
                    data-testid={`button-expand-${member.id}`}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {isExpanded && memberDetail && memberDetail.id === member.id && (
                <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                  <div>
                    <p className="text-xs font-heading uppercase tracking-widest text-muted-foreground mb-2">Skills</p>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {memberDetail.skillStatuses.map(ss => (
                        <div key={ss.skillId} className="flex items-center gap-2 text-sm">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            ss.status === "green" ? "bg-et-green" :
                            ss.status === "yellow" ? "bg-et-yellow" :
                            "bg-destructive/60"
                          }`} />
                          <span className="truncate">{ss.skillName || "Skill #" + ss.skillId}</span>
                          <span className="text-xs text-muted-foreground ml-auto shrink-0">{ss.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {memberDetail.badges && memberDetail.badges.length > 0 && (
                    <div>
                      <p className="text-xs font-heading uppercase tracking-widest text-muted-foreground mb-2">Badges</p>
                      <div className="flex gap-2 flex-wrap">
                        {memberDetail.badges.map((b, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {b.badgeType}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {(!team || team.length === 0) && (
        <p className="text-muted-foreground text-center py-8">No team members found</p>
      )}
    </div>
  );
}

function GapsTab() {
  const { data: analytics } = useQuery<Analytics>({ queryKey: ["/api/manager/analytics"] });

  const gaps = analytics?.skillGaps || [];
  const maxRed = Math.max(...gaps.map(g => g.redCount), 1);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-border">
        <CardHeader>
          <h3 className="font-heading font-semibold">Most Common Skill Gaps</h3>
          <p className="text-sm text-muted-foreground">Skills where the most team members need improvement</p>
        </CardHeader>
        <CardContent>
          {gaps.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No skill gap data available yet</p>
          ) : (
            <div className="space-y-3">
              {gaps.map(gap => {
                const pct = Math.round((gap.redCount / maxRed) * 100);
                return (
                  <div key={gap.skillId} className="flex items-center gap-3" data-testid={`gap-skill-${gap.skillId}`}>
                    <span className="text-sm w-40 shrink-0 truncate">{gap.skillName}</span>
                    <div className="flex-1 h-5 bg-muted rounded-md overflow-hidden">
                      <div
                        className="h-full bg-destructive/60 rounded-md transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground w-20 text-right shrink-0">{gap.redCount} members</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab() {
  const { data: activity, isLoading } = useQuery<ActivityItem[]>({ queryKey: ["/api/manager/activity"] });

  const formatEvent = (item: ActivityItem) => {
    const data = item.eventDataJson || {};
    switch (item.eventType) {
      case "skill_complete":
        return `completed skill "${data.skillName || "unknown"}"`;
      case "level_up":
        return `leveled up to ${LEVEL_NAMES[data.level] || "Level " + ((data.level ?? -1) + 1)}`;
      case "assessment_completed":
        return `completed skill discovery (${LEVEL_NAMES[data.level] || "Level " + ((data.level ?? -1) + 1)})`;
      case "nudge_read":
        return `read a Power Up`;
      default:
        return item.eventType.replace(/_/g, " ");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border border-border">
        <CardHeader>
          <h3 className="font-heading font-semibold">Recent Activity</h3>
        </CardHeader>
        <CardContent>
          {(!activity || activity.length === 0) ? (
            <p className="text-muted-foreground text-center py-6">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {activity.map(item => (
                <div key={item.id} className="flex items-start gap-3 py-2" data-testid={`activity-item-${item.id}`}>
                  <div className="w-8 h-8 rounded-full bg-et-pink/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity className="w-4 h-4 text-et-pink" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{item.userName || "Unknown"}</span>{" "}
                      <span className="text-muted-foreground">{formatEvent(item)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
