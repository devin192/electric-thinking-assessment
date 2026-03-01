import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/wordmark";
import { RPGMap } from "@/components/rpg-map";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import type { Assessment, Level, Skill, UserSkillStatus, Nudge, Badge as BadgeType, LiveSession } from "@shared/schema";
import {
  ArrowRight, CheckCircle2, AlertCircle, Settings,
  LogOut, BarChart3, User as UserIcon, Bell, Lightbulb,
  Users, BookCheck, Sparkles, Mail, Loader2,
  Share2, Download, Copy, Calendar, Video, ExternalLink, Flame
} from "lucide-react";
import { SiLinkedin } from "react-icons/si";

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-et-cyan", 1: "bg-et-gold", 2: "bg-et-pink", 3: "bg-et-orange", 4: "bg-et-blue",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "green") return <CheckCircle2 className="w-4 h-4 text-et-green" />;
  if (status === "yellow") return <AlertCircle className="w-4 h-4 text-et-yellow" />;
  return <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />;
}

function generateICS(session: LiveSession): string {
  const start = new Date(session.sessionDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Electric Thinking//EN",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${session.title}`,
    `DESCRIPTION:${session.description || "Electric Thinking Live Session"}`,
    session.joinLink ? `URL:${session.joinLink}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadICS(session: LiveSession) {
  const ics = generateICS(session);
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${session.title.replace(/\s+/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardPage() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const [verifyingSkill, setVerifyingSkill] = useState<Skill | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState<any>(null);
  const [showPastSessions, setShowPastSessions] = useState(false);

  const { data: assessment } = useQuery<Assessment | null>({
    queryKey: ["/api/assessment/latest"],
    enabled: !!user,
  });
  const { data: levels } = useQuery<Level[]>({ queryKey: ["/api/levels"] });
  const { data: allSkills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: userSkills } = useQuery<UserSkillStatus[]>({
    queryKey: ["/api/user/skills"],
    enabled: !!user,
  });
  const { data: nudges } = useQuery<Nudge[]>({
    queryKey: ["/api/user/nudges"],
    enabled: !!user,
  });
  const { data: badges } = useQuery<BadgeType[]>({
    queryKey: ["/api/user/badges"],
    enabled: !!user,
  });
  const { data: upcomingSessions } = useQuery<LiveSession[]>({
    queryKey: ["/api/sessions/upcoming"],
    enabled: !!user && !!assessment,
  });
  const { data: allSessions } = useQuery<LiveSession[]>({
    queryKey: ["/api/sessions"],
    enabled: !!user && !!assessment,
  });

  const { isLoading: authLoading } = useAuth();

  useEffect(() => {
    document.title = "Dashboard | Electric Thinking";
  }, []);

  const fireConfetti = useCallback(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }, []);

  const fireLevelUpConfetti = useCallback(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    confetti({ particleCount: 80, spread: 100, origin: { x: 0.3, y: 0.5 } });
    setTimeout(() => confetti({ particleCount: 80, spread: 100, origin: { x: 0.7, y: 0.5 } }), 500);
    setTimeout(() => confetti({ particleCount: 120, spread: 120, origin: { y: 0.4 } }), 1000);
  }, []);

  if (authLoading) return null;
  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const scores = (assessment?.scoresJson || {}) as Record<string, { status: string; explanation: string }>;
  const firstMove = (assessment?.firstMoveJson || {}) as { skillName?: string; suggestion?: string };
  const assessmentLevel = assessment?.assessmentLevel ?? null;
  const currentLevelInfo = levels?.find(l => l.sortOrder === assessmentLevel);

  const getSkillStatus = (skillId: number, skillName: string) => {
    const userStatus = userSkills?.find(us => us.skillId === skillId);
    if (userStatus) return userStatus.status;
    return scores[skillName]?.status || "red";
  };

  const totalGreen = userSkills?.filter(s => s.status === "green").length
    || Object.values(scores).filter(s => s.status === "green").length;
  const totalSkills = allSkills?.length || 25;

  const unreadNudges = (nudges || []).filter(n => !n.inAppRead);
  const latestNudge = nudges?.[0];

  const isManagerRole = ["manager", "org_admin", "system_admin"].includes(user.userRole);

  const pastSessions = (allSessions || []).filter(s => new Date(s.sessionDate) < new Date() && s.recordingLink);
  const nextSession = (upcomingSessions || [])[0];

  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";

  const startVerification = async (skill: Skill) => {
    setVerifyingSkill(skill);
    setQuizLoading(true);
    setQuizResult(null);
    setQuizAnswers([]);
    try {
      const res = await apiRequest("POST", `/api/skills/${skill.id}/verify/start`);
      const data = await res.json();
      setQuizQuestions(data.questions);
      setQuizAnswers(new Array(data.questions.length).fill(-1));
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setVerifyingSkill(null);
    } finally {
      setQuizLoading(false);
    }
  };

  const submitVerification = async () => {
    if (!verifyingSkill) return;
    setQuizLoading(true);
    try {
      const res = await apiRequest("POST", `/api/skills/${verifyingSkill.id}/verify/submit`, {
        answers: quizAnswers,
      });
      const data = await res.json();
      setQuizResult(data);

      if (data.passed) {
        fireConfetti();
        queryClient.invalidateQueries({ queryKey: ["/api/user/skills"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user/badges"] });
        queryClient.invalidateQueries({ queryKey: ["/api/assessment/latest"] });

        if (data.levelUp) {
          setLevelUpInfo(data.levelUpInfo);
          setTimeout(() => {
            setVerifyingSkill(null);
            setShowLevelUp(true);
            fireLevelUpConfetti();
          }, 2000);
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setQuizLoading(false);
    }
  };

  const markNudgeRead = async (nudgeId: number) => {
    try {
      await apiRequest("PATCH", `/api/nudges/${nudgeId}/read`);
      queryClient.invalidateQueries({ queryKey: ["/api/user/nudges"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const copyBadgeLink = async (badgeId: number) => {
    try {
      await navigator.clipboard.writeText(`${shareUrl}/api/badge/${badgeId}/share`);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <Wordmark className="text-lg" />
        <div className="flex items-center gap-2 flex-wrap">
          {user.userRole === "system_admin" && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} data-testid="link-admin">
              Admin
            </Button>
          )}
          {isManagerRole && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/manager")} data-testid="link-manager">
              <Users className="w-4 h-4 mr-1" /> Team
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} data-testid="button-settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-full bg-et-pink/15 flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-et-pink" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold">
              {user.name ? `Hey, ${user.name.split(" ")[0]}` : "Welcome"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {user.roleTitle || "Team member"} {user.aiPlatform ? `· ${user.aiPlatform}` : ""}
            </p>
          </div>
        </div>

        {!assessment ? (
          <Card className="rounded-2xl border border-border text-center">
            <CardContent className="pt-12 pb-12">
              <div className="w-16 h-16 rounded-2xl bg-et-pink/15 flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="w-8 h-8 text-et-pink" />
              </div>
              <h2 className="font-heading text-2xl font-bold mb-3">
                Ready to discover your AI fluency?
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Take a 10-minute conversation with an AI that evaluates your skills across 5 levels.
              </p>
              <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/assessment/warmup")} data-testid="button-start-assessment">
                Start Assessment <ArrowRight className="w-5 h-5 ml-2" />
              </Button>

              <div className="mt-12 max-w-sm mx-auto">
                <p className="text-xs text-muted-foreground mb-4">Preview of your skill map</p>
                <div className="space-y-2 opacity-50">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="h-4 bg-muted rounded-md" style={{ width: `${100 - i * 10}%` }} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <Card className="rounded-2xl border border-border">
                <CardContent className="pt-6 pb-6 text-center">
                  <div className={`w-14 h-14 rounded-full ${LEVEL_COLORS[assessmentLevel ?? 0]} flex items-center justify-center mx-auto mb-3`}>
                    <span className="text-white font-heading text-xl font-bold">{assessmentLevel}</span>
                  </div>
                  <p className="font-heading font-semibold">{currentLevelInfo?.displayName || "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">Your Level</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border border-border">
                <CardContent className="pt-6 pb-6 text-center">
                  <p className="font-heading text-3xl font-bold text-et-green mb-1">{totalGreen}</p>
                  <p className="text-sm text-muted-foreground">{totalGreen} of {totalSkills} skills mastered</p>
                  <div className="w-full h-2 bg-muted rounded-full mt-3 overflow-hidden">
                    <div className="h-full bg-et-green rounded-full transition-all duration-500" style={{ width: `${(totalGreen / totalSkills) * 100}%` }} />
                  </div>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border border-border cursor-pointer hover:border-et-pink/30 transition-colors" onClick={() => document.getElementById("nudges-section")?.scrollIntoView({ behavior: "smooth" })} data-testid="card-my-learning">
                <CardContent className="pt-6 pb-6 text-center">
                  <div className="w-10 h-10 rounded-xl bg-et-gold/20 flex items-center justify-center mx-auto mb-3 relative">
                    <Mail className="w-5 h-5 text-et-orange" />
                    {unreadNudges.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-et-pink text-white text-xs rounded-full flex items-center justify-center font-bold" data-testid="badge-unread-nudges">
                        {unreadNudges.length}
                      </span>
                    )}
                  </div>
                  <p className="font-heading font-semibold">My Learning</p>
                  <p className="text-xs text-muted-foreground">
                    {unreadNudges.length > 0 ? `${unreadNudges.length} unread nudge${unreadNudges.length > 1 ? "s" : ""}` : "No new nudges"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {firstMove?.skillName && (
              <Card className="rounded-2xl border-2 border-et-gold/30 mb-8 bg-gradient-to-br from-et-gold/5 to-transparent">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-et-gold/20 flex items-center justify-center shrink-0">
                      <Lightbulb className="w-5 h-5 text-et-orange" />
                    </div>
                    <div>
                      <h3 className="font-heading font-semibold mb-1">Your Active Skill</h3>
                      <p className="text-sm text-muted-foreground mb-1">
                        Focus on: <span className="font-medium text-foreground">{firstMove.skillName}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{firstMove.suggestion}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {nextSession && (
              <Card className="rounded-2xl border border-et-blue/30 mb-8 bg-gradient-to-br from-et-blue/5 to-transparent" data-testid="card-next-session">
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-et-blue/20 flex items-center justify-center shrink-0">
                        <Video className="w-5 h-5 text-et-blue" />
                      </div>
                      <div>
                        <h3 className="font-heading font-semibold mb-1">Your Next Live Session</h3>
                        <p className="text-sm font-medium">{nextSession.title}</p>
                        {nextSession.description && (
                          <p className="text-xs text-muted-foreground mt-1">{nextSession.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(nextSession.sessionDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} at {new Date(nextSession.sessionDate).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-start">
                      {nextSession.joinLink && (
                        <Button size="sm" className="rounded-xl" onClick={() => window.open(nextSession.joinLink!, "_blank")} data-testid="button-join-session">
                          <ExternalLink className="w-3 h-3 mr-1" /> Join
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="rounded-xl" onClick={() => downloadICS(nextSession)} data-testid="button-add-calendar">
                        <Calendar className="w-3 h-3 mr-1" /> Add to Calendar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {pastSessions.length > 0 && (
              <div className="mb-8">
                <button
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3"
                  onClick={() => setShowPastSessions(!showPastSessions)}
                  data-testid="button-toggle-past-sessions"
                >
                  <Video className="w-4 h-4" />
                  {showPastSessions ? "Hide" : "Show"} Past Sessions ({pastSessions.length})
                </button>
                {showPastSessions && (
                  <div className="space-y-2">
                    {pastSessions.map(s => (
                      <Card key={s.id} className="rounded-xl border border-border">
                        <CardContent className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{s.title}</p>
                            <p className="text-xs text-muted-foreground">{new Date(s.sessionDate).toLocaleDateString()}</p>
                          </div>
                          {s.recordingLink && (
                            <Button variant="ghost" size="sm" className="text-et-blue shrink-0" onClick={() => window.open(s.recordingLink!, "_blank")} data-testid={`button-recording-${s.id}`}>
                              <Video className="w-3 h-3 mr-1" /> Watch Recording
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div id="nudges-section" className="mb-8">
              <h2 className="font-heading text-xl font-bold mb-4">Latest Nudge</h2>
              {latestNudge ? (
                <Card className="rounded-2xl border border-border">
                  <CardContent className="pt-6 pb-6">
                    {(() => {
                      const content = latestNudge.contentJson as any;
                      return (
                        <div className="space-y-4">
                          <p className="text-sm leading-relaxed">{content?.opener}</p>
                          <hr className="border-border/50" />
                          <div>
                            <p className="font-heading text-xs uppercase tracking-widest text-et-pink mb-2">The Idea</p>
                            <p className="text-sm leading-relaxed">{content?.idea}</p>
                          </div>
                          <div>
                            <p className="font-heading text-xs uppercase tracking-widest text-et-pink mb-2">Try This</p>
                            <p className="text-sm leading-relaxed">{content?.action}</p>
                          </div>
                          <div>
                            <p className="font-heading text-xs uppercase tracking-widest text-et-pink mb-2">Reflect</p>
                            <p className="text-sm leading-relaxed italic text-muted-foreground">{content?.reflection}</p>
                          </div>
                          {content?.story && (
                            <div>
                              <p className="font-heading text-xs uppercase tracking-widest text-et-pink mb-2">Story</p>
                              <p className="text-sm leading-relaxed text-muted-foreground">{content?.story}</p>
                            </div>
                          )}
                          {!latestNudge.inAppRead && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              onClick={() => markNudgeRead(latestNudge.id)}
                              data-testid="button-mark-read"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Read
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-2xl border border-border">
                  <CardContent className="pt-6 pb-6 text-center">
                    <div className="w-12 h-12 rounded-xl bg-et-gold/10 flex items-center justify-center mx-auto mb-4">
                      <Bell className="w-6 h-6 text-et-orange" />
                    </div>
                    <p className="font-heading font-semibold mb-1">No nudges yet</p>
                    <p className="text-sm text-muted-foreground">
                      Your first learning nudge arrives on {user.nudgeDay || "Monday"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            {(badges || []).length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-heading text-xl font-bold">Badges</h2>
                  {(user as any).streakCount > 0 && (
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-et-gold/10 border border-et-gold/20" data-testid="badge-streak">
                      <Flame className="w-4 h-4 text-et-orange" />
                      <span className="text-xs font-medium text-et-orange">{(user as any).streakCount} week streak</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {(badges || []).map(b => {
                    const data = b.badgeDataJson as any;
                    return (
                      <DropdownMenu key={b.id}>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-et-gold/10 border border-et-gold/20 hover:border-et-gold/40 transition-colors cursor-pointer"
                            data-testid={`badge-${b.id}`}
                          >
                            <Sparkles className="w-4 h-4 text-et-orange" />
                            <span className="text-xs font-medium">
                              {b.badgeType === "skill_complete" ? data?.skillName : b.badgeType === "level_up" ? `Level ${data?.level}` : b.badgeType === "streak" ? `${data?.weeks}w Streak` : b.badgeType}
                            </span>
                            <Share2 className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => window.open(`/api/badge/${b.id}`, "_blank")} data-testid={`badge-download-${b.id}`}>
                            <Download className="w-4 h-4 mr-2" /> Download Badge
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${shareUrl}/api/badge/${b.id}/share`)}`, "_blank")}
                            data-testid={`badge-linkedin-${b.id}`}
                          >
                            <SiLinkedin className="w-4 h-4 mr-2" /> Share on LinkedIn
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copyBadgeLink(b.id)} data-testid={`badge-copy-${b.id}`}>
                            <Copy className="w-4 h-4 mr-2" /> Copy Link
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })}
                </div>
              </div>
            )}

            <h2 className="font-heading text-xl font-bold mb-4">Skill Progression</h2>
            {levels && allSkills && (
              <RPGMap
                levels={levels}
                skills={allSkills}
                userSkills={userSkills || []}
                scores={scores}
                assessmentLevel={assessmentLevel}
                onVerifySkill={startVerification}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!verifyingSkill && !showLevelUp} onOpenChange={(open) => { if (!open) { setVerifyingSkill(null); setQuizResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {quizResult ? (quizResult.passed ? "Skill Verified!" : "Not Quite") : `Verify: ${verifyingSkill?.name}`}
            </DialogTitle>
          </DialogHeader>

          {quizLoading && !quizResult && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-et-pink" />
              <span className="ml-3 text-muted-foreground">Generating questions...</span>
            </div>
          )}

          {!quizLoading && quizQuestions.length > 0 && !quizResult && (
            <div className="space-y-6">
              {quizQuestions.map((q, qi) => (
                <div key={qi} className="space-y-3">
                  <p className="text-sm font-medium">{qi + 1}. {q.question}</p>
                  <div className="space-y-2">
                    {q.options.map((opt: string, oi: number) => (
                      <button
                        key={oi}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                          quizAnswers[qi] === oi
                            ? "border-et-pink bg-et-pink/5 text-foreground"
                            : "border-border hover:border-et-pink/30"
                        }`}
                        onClick={() => {
                          const newAnswers = [...quizAnswers];
                          newAnswers[qi] = oi;
                          setQuizAnswers(newAnswers);
                        }}
                        data-testid={`quiz-option-${qi}-${oi}`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <Button
                className="w-full rounded-2xl py-5"
                onClick={submitVerification}
                disabled={quizAnswers.some(a => a === -1)}
                data-testid="button-submit-quiz"
              >
                Submit Answers
              </Button>
            </div>
          )}

          {quizResult && (
            <div className="text-center py-6">
              {quizResult.passed ? (
                <div className="animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 rounded-full bg-et-green/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-10 h-10 text-et-green" />
                  </div>
                  <p className="font-heading text-xl font-bold mb-2">{quizResult.message}</p>
                  <p className="text-sm text-muted-foreground mb-2">
                    {quizResult.correctCount}/3 correct
                  </p>
                  {quizResult.nextSkillName && (
                    <p className="text-sm text-muted-foreground">
                      Up next: <span className="font-medium text-foreground">{quizResult.nextSkillName}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <div className="w-20 h-20 rounded-full bg-et-gold/10 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-10 h-10 text-et-orange" />
                  </div>
                  <p className="font-heading text-lg font-bold mb-2">{quizResult.message}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {quizResult.correctCount}/3 correct — you need 2 to pass
                  </p>
                  <Button variant="outline" className="rounded-xl" onClick={() => { setVerifyingSkill(null); setQuizResult(null); }} data-testid="button-close-quiz">
                    Got it
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showLevelUp} onOpenChange={setShowLevelUp}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-8">
            <div className="relative mb-6">
              <div className={`w-24 h-24 rounded-full ${LEVEL_COLORS[levelUpInfo?.level ?? 0]} flex items-center justify-center mx-auto level-up-glow`}>
                <span className="text-white font-heading text-4xl font-bold">{levelUpInfo?.level}</span>
              </div>
            </div>
            <h2 className="font-heading text-2xl font-bold mb-2">Level Up!</h2>
            <p className="text-lg text-muted-foreground mb-2">
              You're now a <span className="font-semibold text-foreground">{levelUpInfo?.name}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              All Level {levelUpInfo?.level} skills complete. That's a real milestone.
            </p>
            <Button className="rounded-2xl px-8" onClick={() => setShowLevelUp(false)} data-testid="button-close-levelup">
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .level-up-glow {
          box-shadow: 0 0 40px rgba(255,47,134,0.4), 0 0 80px rgba(255,47,134,0.2);
          animation: level-glow 2s ease-in-out infinite;
        }
        @keyframes level-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(255,47,134,0.4), 0 0 80px rgba(255,47,134,0.2); }
          50% { box-shadow: 0 0 60px rgba(255,47,134,0.6), 0 0 120px rgba(255,47,134,0.3); }
        }
        @media (prefers-reduced-motion: reduce) {
          .level-up-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}
