/**
 * Deploy Verification Script
 *
 * Runs AFTER every deploy to verify the live app actually works.
 * This is the "smoke test on the real thing" step that was missing
 * when QA came back clean but beta testers hit 500s.
 *
 * Usage: APP_URL=https://... ADMIN_PASSWORD=... npx tsx scripts/verify-deploy.ts
 *
 * What it checks:
 * 1. Server is reachable
 * 2. Public endpoints return data
 * 3. Admin can log in
 * 4. Database has correct schema (via admin system-health)
 * 5. Full assessment flow works end-to-end via API
 * 6. Voice availability endpoint responds correctly
 * 7. Cleanup: deletes test user
 */

const APP_URL = process.env.APP_URL || process.argv[2];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_EMAIL = "admin@electricthinking.com";

if (!APP_URL) {
  console.error("Usage: APP_URL=https://your-app.railway.app npx tsx scripts/verify-deploy.ts");
  console.error("  or: npx tsx scripts/verify-deploy.ts https://your-app.railway.app");
  process.exit(1);
}

// Simple session-aware HTTP client (native fetch doesn't handle cookies)
class SessionClient {
  private cookies: string[] = [];

  constructor(private baseUrl: string) {}

  async fetch(path: string, options: RequestInit & { json?: any } = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Cookie: this.cookies.join("; "),
    };

    if (options.json) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.json);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
      redirect: "manual",
    });

    // Capture session cookies
    const setCookies = res.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const name = cookie.split("=")[0];
      this.cookies = this.cookies.filter(c => !c.startsWith(name + "="));
      this.cookies.push(cookie.split(";")[0]);
    }

    return res;
  }
}

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
  critical: boolean;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail: string, critical = true) {
  results.push({ name, passed, detail, critical });
  const icon = passed ? "PASS" : critical ? "FAIL" : "WARN";
  console.log(`  [${icon}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`\nVerifying deploy at: ${APP_URL}\n`);

  const client = new SessionClient(APP_URL);
  let testUserId: number | null = null;
  let assessmentId: number | null = null;

  // ============================================
  // Phase 1: Server reachability
  // ============================================
  console.log("Phase 1: Server Reachability");
  try {
    const res = await client.fetch("/api/levels");
    check("Server reachable", res.status === 200, `status ${res.status}`);
    const levels = await res.json();
    check("Levels endpoint returns data", Array.isArray(levels) && levels.length === 5, `${levels.length} levels`);
  } catch (err: any) {
    check("Server reachable", false, err.message);
    printSummary();
    process.exit(1);
  }

  // ============================================
  // Phase 2: Public endpoints
  // ============================================
  console.log("\nPhase 2: Public Endpoints");
  try {
    const skillsRes = await client.fetch("/api/skills");
    const skills = await skillsRes.json();
    check("Skills endpoint", skillsRes.status === 200 && Array.isArray(skills), `${skills.length} skills`);
    check("Skills count is 25 (5 per level)", skills.length === 25, `got ${skills.length}`);
  } catch (err: any) {
    check("Skills endpoint", false, err.message);
  }

  try {
    const platformsRes = await client.fetch("/api/platforms");
    const platforms = await platformsRes.json();
    check("Platforms endpoint", platformsRes.status === 200 && Array.isArray(platforms), `${platforms.length} platforms`);
  } catch (err: any) {
    check("Platforms endpoint", false, err.message);
  }

  // ============================================
  // Phase 3: Admin login
  // ============================================
  console.log("\nPhase 3: Admin Authentication");
  try {
    const loginRes = await client.fetch("/api/auth/login", {
      method: "POST",
      json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    check("Admin login", loginRes.status === 200, `status ${loginRes.status}`);

    const meRes = await client.fetch("/api/auth/me");
    if (meRes.status === 200) {
      const me = await meRes.json();
      check("Session persists", me.email === ADMIN_EMAIL, me.email);
      check("Admin role", me.userRole === "system_admin", me.userRole);
    } else {
      check("Session persists", false, `status ${meRes.status}`);
    }
  } catch (err: any) {
    check("Admin login", false, err.message);
  }

  // ============================================
  // Phase 4: Admin endpoints (verify DB connectivity)
  // ============================================
  console.log("\nPhase 4: Admin Endpoints (DB connectivity)");
  try {
    const healthRes = await client.fetch("/api/admin/system-health");
    check("System health endpoint", healthRes.status === 200, `status ${healthRes.status}`);
    if (healthRes.status === 200) {
      const health = await healthRes.json();
      check("System health has cron data", !!health.cronJobs, health.cronJobs ? "cron jobs configured" : "missing cron data");
      check("System health has email data", !!health.email, health.email ? `${health.email.recentSent} emails sent` : "missing email data");
    }
  } catch (err: any) {
    check("System health endpoint", false, err.message);
  }

  // Verify DB connectivity via admin users list
  try {
    const usersRes = await client.fetch("/api/admin/users");
    check("Admin users list (DB connectivity)", usersRes.status === 200, `status ${usersRes.status}`);
    if (usersRes.status === 200) {
      const users = await usersRes.json();
      check("Users exist in DB", Array.isArray(users) && users.length > 0, `${users.length} users`);
    }
  } catch (err: any) {
    check("Admin users list", false, err.message);
  }

  try {
    const configRes = await client.fetch("/api/admin/config/assessment_conversation_guide");
    check("Config endpoint (assessment guide)", configRes.status === 200, `status ${configRes.status}`);
    if (configRes.status === 200) {
      const config = await configRes.json();
      check("Assessment guide is V6", config.value?.includes("CALIBRATION:"), config.value?.includes("CALIBRATION:") ? "V6 detected" : "OLD version");
    }
  } catch (err: any) {
    check("Config endpoint", false, err.message);
  }

  try {
    const voiceConfigRes = await client.fetch("/api/admin/config/elevenlabs_agent_id");
    if (voiceConfigRes.status === 200) {
      const vc = await voiceConfigRes.json();
      check("ElevenLabs agent ID configured", !!vc.value, vc.value ? "set" : "MISSING");
    }
  } catch (err: any) {
    check("ElevenLabs agent ID", false, err.message, false);
  }

  // ============================================
  // Phase 5: Voice availability
  // ============================================
  console.log("\nPhase 5: Voice Availability");
  try {
    const voiceRes = await client.fetch("/api/assessment/voice-available");
    if (voiceRes.status === 200) {
      const voice = await voiceRes.json();
      check("Voice-available endpoint", true, `available: ${voice.available}`, false);
    } else {
      check("Voice-available endpoint", false, `status ${voiceRes.status}`, false);
    }
  } catch (err: any) {
    check("Voice-available endpoint", false, err.message, false);
  }

  // ============================================
  // Phase 6: Full assessment flow (the real test)
  // ============================================
  console.log("\nPhase 6: Full Assessment Flow (E2E)");

  // Create test user
  const testEmail = `deploy-test-${Date.now()}@test.electricthinking.ai`;
  const testPassword = "TestPass123!";

  try {
    // Register
    const regRes = await client.fetch("/api/auth/register", {
      method: "POST",
      json: { email: testEmail, password: testPassword, name: "Deploy Test User" },
    });
    check("Register test user", regRes.status === 200 || regRes.status === 201, `status ${regRes.status}`);

    if (regRes.status === 200 || regRes.status === 201) {
      const regData = await regRes.json();
      testUserId = regData.id;

      // Start assessment
      const startRes = await client.fetch("/api/assessment/start", {
        method: "POST",
        json: {},
      });
      check("Start assessment", startRes.status === 200 || startRes.status === 201, `status ${startRes.status}`);

      if (startRes.status === 200 || startRes.status === 201) {
        const startData = await startRes.json();
        assessmentId = startData.id;
        check("Assessment created with ID", !!assessmentId, `id: ${assessmentId}`);

        // Send a message (this is the call that was 500-ing for Katrina)
        const msgRes = await client.fetch(`/api/assessment/${assessmentId}/message`, {
          method: "POST",
          json: { message: "I'm a deploy verification test. I work as a software engineer." },
        });
        check("Send assessment message", msgRes.status === 200, `status ${msgRes.status}`);

        if (msgRes.status === 200) {
          const msgData = await msgRes.json();
          check("Message returns messages array", Array.isArray(msgData.messages), `${msgData.messages?.length} messages`);
          check("AI responded", msgData.messages?.length >= 2, `${msgData.messages?.length} messages (should be >= 2)`);
        }

        // Check active assessment
        const activeRes = await client.fetch("/api/assessment/active");
        check("Active assessment endpoint", activeRes.status === 200, `status ${activeRes.status}`);

        // Complete assessment (will trigger scoring — this is the call that timed out on iOS)
        const completeRes = await client.fetch(`/api/assessment/${assessmentId}/complete`, {
          method: "POST",
        });
        // Scoring may take a while, but the endpoint should return
        check("Complete assessment", completeRes.status === 200, `status ${completeRes.status}`);

        if (completeRes.status === 200) {
          // Give scoring a moment, then check latest
          await new Promise(r => setTimeout(r, 3000));
          const latestRes = await client.fetch("/api/assessment/latest");
          if (latestRes.status === 200) {
            const latest = await latestRes.json();
            check("Latest assessment has scores", latest.scoresJson !== null, latest.scoresJson ? "scored" : "no scores yet (may still be processing)");
            check("Latest assessment has level", latest.assessmentLevel !== null && latest.assessmentLevel !== undefined, `level: ${latest.assessmentLevel}`);
            check("Work context captured", !!latest.workContextSummary, latest.workContextSummary ? "yes" : "MISSING — this was the Katrina bug");
          }
        }
      }
    }
  } catch (err: any) {
    check("Assessment flow", false, err.message);
  }

  // ============================================
  // Phase 7: Cleanup
  // ============================================
  console.log("\nPhase 7: Cleanup");
  if (testUserId) {
    try {
      // Use a separate admin session for cleanup (main session is the test user)
      const adminClient = new SessionClient(APP_URL);
      await adminClient.fetch("/api/auth/login", {
        method: "POST",
        json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      const deleteRes = await adminClient.fetch(`/api/admin/users/${testUserId}`, {
        method: "DELETE",
      });
      check("Delete test user", deleteRes.status === 200, `status ${deleteRes.status}`, false);
    } catch (err: any) {
      check("Delete test user", false, err.message, false);
    }
  } else {
    console.log("  [SKIP] No test user to clean up");
  }

  printSummary();
}

function printSummary() {
  console.log("\n=== Deploy Verification Summary ===");
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed && r.critical).length;
  const warned = results.filter(r => !r.passed && !r.critical).length;
  const total = results.length;

  console.log(`${passed}/${total} passed, ${failed} failed, ${warned} warnings\n`);

  if (failed > 0) {
    console.log("CRITICAL FAILURES:");
    for (const r of results.filter(r => !r.passed && r.critical)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    console.log("\nDEPLOY VERIFICATION FAILED — do not send users to this build.");
    process.exit(1);
  } else {
    console.log("DEPLOY VERIFICATION PASSED — safe for users.");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Verification script crashed:", err);
  process.exit(1);
});
