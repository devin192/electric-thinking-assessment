import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/wordmark";
import { ChallengeCoach } from "@/components/challenge-coach";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import confetti from "canvas-confetti";
import type { Assessment, Level, Skill, UserSkillStatus, Nudge, Badge as BadgeType, LiveSession } from "@shared/schema";
import {
  ArrowRight, CheckCircle2, AlertCircle, Settings,
  LogOut, BarChart3, User as UserIcon, Bell, Lightbulb,
  Users, BookCheck, Sparkles, Mail, Loader2,
  Share2, Download, Copy, Calendar, Video, ExternalLink, Flame,
  MessageCircle, Trophy
} from "lucide-react";
import { SiLinkedin } from "react-icons/si";

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-et-cyan", 1: "bg-et-gold", 2: "bg-et-pink", 3: "bg-et-orange", 4: "bg-et-blue",
};
const LEVEL_HEX: Record<number, string> = {
  0: "#2DD6FF", 1: "#FFD236", 2: "#FF2F86", 3: "#FF6A2B", 4: "#1C4BFF",
};

const LEVEL_NAMES: Record<number, string> = {
  0: "Explorer", 1: "Accelerator", 2: "Thought Partner", 3: "Specialized Teammates", 4: "Agentic Workflow",
};

type TeamSnapshot = {
  memberCount: number;
  averageLevel: number;
  levelDistribution: Record<number, number>;
  powerUpsCompletedThisWeek: number;
  recentLevelUps: number;
  userRank: "middle" | "ahead" | "behind";
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
  a.download = `${(session.title || "session").replace(/\s+/g, "_")}.ics`;
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
  const [coachOpen, setCoachOpen] = useState(false);
  const [reflectionOpen, setReflectionOpen] = useState(false);
  const [reflectionNote, setReflectionNote] = useState("");
  const [reflectionSubmitting, setReflectionSubmitting] = useState(false);
  const [reflectionDone, setReflectionDone] = useState(false);

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
  const pollStartRef = useRef(Date.now());
  const { data: nudges } = useQuery<Nudge[]>({
    queryKey: ["/api/user/nudges"],
    enabled: !!user,
    refetchInterval: (query) => {
      // Poll every 3s while the first challenge is still generating, max 60s
      const data = query.state.data;
      const empty = !data || data.length === 0;
      const withinTimeout = Date.now() - pollStartRef.current < 60000;
      return empty && withinTimeout ? 3000 : false;
    },
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

  const { data: teamSnapshot } = useQuery<TeamSnapshot>({
    queryKey: ["/api/team/snapshot"],
    enabled: !!user && !!user.orgId && !!assessment,
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

  if (authLoading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

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

  const pastSessions = (allSessions || []).filter(s => s.sessionDate && new Date(s.sessionDate) < new Date() && s.recordingLink);
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

  const submitReflection = async (nudgeId: number) => {
    if (!reflectionNote.trim()) return;
    setReflectionSubmitting(true);
    try {
      await apiRequest("POST", `/api/challenge/${nudgeId}/reflect`, { note: reflectionNote.trim() });
      setReflectionDone(true);
      setReflectionNote("");
      queryClient.invalidateQueries({ queryKey: ["/api/user/nudges"] });
      fireConfetti();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setReflectionSubmitting(false);
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} aria-label="Settings" data-testid="button-settings">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Log out" data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            <span className="ml-1">Sign out</span>
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
                Have a quick conversation with an AI that evaluates your skills across 5 levels.
              </p>
              <Button className="rounded-2xl px-8 py-5" onClick={() => navigate("/assessment/warmup")} data-testid="button-start-assessment">
                Have a Conversation <ArrowRight className="w-5 h-5 ml-2" />
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
                    <span className="text-white font-heading text-xl font-bold">{(assessmentLevel ?? 0) + 1}</span>
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
              <Card className="rounded-2xl border border-border cursor-pointer hover:border-et-pink/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} onClick={() => document.getElementById("nudges-section")?.scrollIntoView({ behavior: "smooth" })} data-testid="card-my-learning">
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
                    {unreadNudges.length > 0 ? `${unreadNudges.length} new Power Up${unreadNudges.length > 1 ? "s" : ""}` : "All caught up"}
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
              <h2 className="font-heading text-xl font-bold mb-4">Latest Power Up</h2>
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
                          <div className="flex flex-wrap gap-2 pt-2">
                            {!latestNudge.inAppRead && !reflectionDone && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => setReflectionOpen(!reflectionOpen)}
                                data-testid="button-i-did-it"
                              >
                                <Trophy className="w-4 h-4 mr-1" /> I Did It
                              </Button>
                            )}
                            {!latestNudge.inAppRead && !reflectionDone && (
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
                            <Button
                              variant={coachOpen ? "default" : "outline"}
                              size="sm"
                              className="rounded-xl"
                              onClick={() => setCoachOpen(!coachOpen)}
                              data-testid="button-coach"
                            >
                              <MessageCircle className="w-4 h-4 mr-1" /> {coachOpen ? "Hide Coach" : "Need Help?"}
                            </Button>
                          </div>

                          {reflectionDone && (
                            <div className="flex items-center gap-2 text-sm text-et-green pt-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Power Up complete. Nice work.</span>
                            </div>
                          )}

                          {reflectionOpen && !reflectionDone && (
                            <div className="mt-3 border border-border rounded-xl p-4 space-y-3" data-testid="reflection-panel">
                              <p className="text-sm text-muted-foreground">
                                Quick note on how it went. What did you try? What did you notice?
                              </p>
                              <textarea
                                value={reflectionNote}
                                onChange={e => setReflectionNote(e.target.value)}
                                placeholder="I tried..."
                                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                data-testid="reflection-input"
                              />
                              <Button
                                size="sm"
                                className="rounded-xl"
                                onClick={() => submitReflection(latestNudge.id)}
                                disabled={!reflectionNote.trim() || reflectionSubmitting}
                                data-testid="reflection-submit"
                              >
                                {reflectionSubmitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                                Submit
                              </Button>
                            </div>
                          )}

                          <ChallengeCoach
                            nudgeId={latestNudge.id}
                            challengeContent={content}
                            isOpen={coachOpen}
                            onClose={() => setCoachOpen(false)}
                          />
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-2xl border border-border">
                  <CardContent className="pt-6 pb-6 text-center">
                    <div className="w-12 h-12 rounded-xl bg-et-gold/10 flex items-center justify-center mx-auto mb-4">
                      <Loader2 className="w-6 h-6 text-et-orange animate-spin" />
                    </div>
                    <p className="font-heading font-semibold mb-1">Creating your first Power Up...</p>
                    <p className="text-sm text-muted-foreground">
                      Personalizing a challenge based on your assessment. This usually takes a few seconds.
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
                              {b.badgeType === "skill_complete" ? data?.skillName : b.badgeType === "level_up" ? `Level ${(data?.level ?? 0) + 1}` : b.badgeType === "streak" ? `${data?.weeks}w Streak` : b.badgeType}
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


            {/* === YOUR TEAM (only for org users) === */}
            {user.orgId && teamSnapshot && (
              <div className="mb-8" data-testid="section-team-progress">
                <h2 className="font-heading text-xl font-bold mb-4">Your Team</h2>

                {/* Team stat card */}
                <Card className="rounded-2xl border border-border mb-4">
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-et-blue/15 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5 text-et-blue" />
                        </div>
                        <div>
                          <p className="font-heading font-semibold text-sm">{teamSnapshot.memberCount} team members</p>
                          <p className="text-xs text-muted-foreground">Avg Level {Math.round(teamSnapshot.averageLevel * 10) / 10}</p>
                        </div>
                      </div>
                      {/* Mini level distribution bar */}
                      <div className="flex h-5 rounded-md overflow-hidden flex-1 max-w-[200px]">
                        {[0, 1, 2, 3, 4].map(level => {
                          const count = teamSnapshot.levelDistribution[level] || 0;
                          const pct = teamSnapshot.memberCount > 0 ? (count / teamSnapshot.memberCount) * 100 : 0;
                          if (pct === 0) return null;
                          return (
                            <div
                              key={level}
                              className="h-full transition-all duration-700"
                              style={{ width: `${pct}%`, backgroundColor: LEVEL_HEX[level] }}
                              title={`L${level + 1}: ${count}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Team progress bar (animated) */}
                <Card className="rounded-2xl border border-border">
                  <CardContent className="pt-5 pb-5 space-y-4">
                    <p className="text-xs font-heading uppercase tracking-widest text-muted-foreground">Team Level Distribution</p>
                    <div className="flex h-8 rounded-lg overflow-hidden bg-muted">
                      {[0, 1, 2, 3, 4].map(level => {
                        const count = teamSnapshot.levelDistribution[level] || 0;
                        const pct = teamSnapshot.memberCount > 0 ? (count / teamSnapshot.memberCount) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <motion.div
                            key={level}
                            className="h-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: LEVEL_HEX[level] }}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, delay: level * 0.1 }}
                            title={`${LEVEL_NAMES[level]}: ${count}`}
                          >
                            {pct >= 10 ? `L${level + 1}` : ""}
                          </motion.div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground flex-wrap">
                      {teamSnapshot.powerUpsCompletedThisWeek > 0 && (
                        <span>{teamSnapshot.powerUpsCompletedThisWeek} Power Up{teamSnapshot.powerUpsCompletedThisWeek !== 1 ? "s" : ""} completed this week</span>
                      )}
                      {teamSnapshot.recentLevelUps > 0 && (
                        <span>{teamSnapshot.recentLevelUps} {teamSnapshot.recentLevelUps === 1 ? "person" : "people"} leveled up recently</span>
                      )}
                    </div>

                    {/* Position message (only show if middle or ahead) */}
                    {teamSnapshot.userRank === "middle" && (
                      <p className="text-xs text-muted-foreground">You're right in the middle of your group</p>
                    )}
                    {teamSnapshot.userRank === "ahead" && (
                      <p className="text-xs text-muted-foreground">You're leading the pack</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Subtle team invite for solo users */}
            {!user.orgId && assessment && (
              <div className="mb-8 text-center">
                <p className="text-xs text-muted-foreground/60">This gets better with your team</p>
              </div>
            )}

            <h2 className="font-heading text-xl font-bold mb-4">Your Skills</h2>
            {levels && allSkills && (() => {
              const sortedLevels = [...levels].sort((a, b) => a.sortOrder - b.sortOrder);
              const currentLevelSkills = allSkills.filter(s => {
                const lvl = levels.find(l => l.id === s.levelId);
                return lvl?.sortOrder === assessmentLevel;
              });
              const belowLevelSkills = allSkills.filter(s => {
                const lvl = levels.find(l => l.id === s.levelId);
                return lvl && lvl.sortOrder < (assessmentLevel ?? 0);
              });
              const belowGreen = belowLevelSkills.filter(s => getSkillStatus(s.id, s.name) === "green").length;

              return (
                <div className="space-y-4 mb-8">
                  {/* Completed levels (collapsed) */}
                  {sortedLevels.filter(l => l.sortOrder < (assessmentLevel ?? 0)).length > 0 && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 px-1">
                      <CheckCircle2 className="w-4 h-4 text-et-green" />
                      <span>{belowGreen} skills completed in earlier levels</span>
                    </div>
                  )}

                  {/* Current level - full detail */}
                  {sortedLevels.filter(l => l.sortOrder === (assessmentLevel ?? 0)).map(level => {
                    const lvlSkills = currentLevelSkills;
                    const greenCount = lvlSkills.filter(s => getSkillStatus(s.id, s.name) === "green").length;
                    return (
                      <Card key={level.id} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: `${LEVEL_HEX[level.sortOrder] || '#888'}40` }}>
                        <CardContent className="pt-6 pb-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="font-heading font-semibold">Level {level.sortOrder + 1}: {level.displayName}</h3>
                              <p className="text-xs text-muted-foreground">{greenCount}/{lvlSkills.length} mastered</p>
                            </div>
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-heading font-bold text-sm" style={{ backgroundColor: LEVEL_HEX[level.sortOrder] || '#888' }}>
                              {level.sortOrder + 1}
                            </div>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full mb-4 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(greenCount / (lvlSkills.length || 1)) * 100}%`, backgroundColor: LEVEL_HEX[level.sortOrder] || '#888' }} />
                          </div>
                          <div className="space-y-2">
                            {lvlSkills.map(skill => {
                              const status = getSkillStatus(skill.id, skill.name);
                              return (
                                <div key={skill.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                                  <div className="flex items-center gap-3">
                                    {status === "green" ? (
                                      <CheckCircle2 className="w-5 h-5 text-et-green" />
                                    ) : status === "yellow" ? (
                                      <AlertCircle className="w-5 h-5 text-et-yellow" />
                                    ) : (
                                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                                    )}
                                    <div>
                                      <p className="text-sm font-medium">{skill.name}</p>
                                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                                    </div>
                                  </div>
                                  {status !== "green" && (
                                    <Button variant="outline" size="sm" className="text-xs rounded-lg shrink-0" onClick={() => startVerification(skill)}>
                                      Practice
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Next level - teaser */}
                  {sortedLevels.filter(l => l.sortOrder === (assessmentLevel ?? 0) + 1).map(level => {
                    const lvlSkills = allSkills.filter(s => s.levelId === level.id);
                    return (
                      <Card key={level.id} className="rounded-2xl border border-border/50 opacity-60">
                        <CardContent className="pt-6 pb-6">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h3 className="font-heading font-semibold text-muted-foreground">Level {level.sortOrder + 1}: {level.displayName}</h3>
                              <p className="text-xs text-muted-foreground">Complete your current level to unlock</p>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center font-heading font-bold text-sm text-muted-foreground">
                              {level.sortOrder + 1}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {lvlSkills.map(skill => (
                              <span key={skill.id} className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground">
                                {skill.name}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                  {/* Higher levels - locked */}
                  {sortedLevels.filter(l => l.sortOrder > (assessmentLevel ?? 0) + 1).length > 0 && (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">
                        {sortedLevels.filter(l => l.sortOrder > (assessmentLevel ?? 0) + 1).length} more level{sortedLevels.filter(l => l.sortOrder > (assessmentLevel ?? 0) + 1).length > 1 ? "s" : ""} to discover
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      <Dialog open={!!verifyingSkill && !showLevelUp} onOpenChange={(open) => { if (!open) { setVerifyingSkill(null); setQuizResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {quizResult ? (quizResult.passed ? "Skill Mastered!" : "Not Quite") : `Quick Check: ${verifyingSkill?.name}`}
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
                    {quizResult.correctCount}/3 correct. You need 2 to pass.
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
              {/* Impact flash behind the level circle */}
              {showLevelUp && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div
                    className="rpg-impact-flash rounded-full"
                    style={{
                      width: 96,
                      height: 96,
                      backgroundColor: LEVEL_HEX[levelUpInfo?.level ?? 0] || '#FF2F86',
                    }}
                  />
                </div>
              )}
              <div className={`w-24 h-24 rounded-full ${LEVEL_COLORS[levelUpInfo?.level ?? 0]} flex items-center justify-center mx-auto level-up-glow relative`}>
                <span className="text-white font-heading text-4xl font-bold">{(levelUpInfo?.level ?? 0) + 1}</span>
              </div>
            </div>
            {/* Brief pause, then text scales up */}
            <h2
              className="font-heading text-2xl font-bold mb-2"
              style={{ animation: 'score-reveal 0.5s ease-out 0.8s both' }}
            >
              Level Up!
            </h2>
            <p
              className="text-lg text-muted-foreground mb-2"
              style={{ animation: 'fade-up 0.5s ease-out 1.1s both' }}
            >
              You're now a <span className="font-semibold text-foreground">{levelUpInfo?.name}</span>
            </p>
            <p
              className="text-sm text-muted-foreground mb-6"
              style={{ animation: 'fade-up 0.5s ease-out 1.4s both' }}
            >
              All Level {(levelUpInfo?.level ?? 0) + 1} skills complete. That's a real milestone.
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
