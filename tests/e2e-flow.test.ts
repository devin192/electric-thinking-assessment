/**
 * End-to-End API Flow Tests
 *
 * These tests hit a REAL running server — not mocks, not code inspection.
 * They catch what the previous "QA" tests could not:
 * - Database column mismatches (the Katrina bug)
 * - API endpoints actually returning data
 * - Session/auth flow working end-to-end
 * - State transitions (assessment lifecycle)
 *
 * Usage: TEST_BASE_URL=http://localhost:5000 ADMIN_PASSWORD=... npm test
 *
 * Skip these in CI without a running server by not setting TEST_BASE_URL.
 */

import { describe, test, expect, beforeAll, afterAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_EMAIL = "admin@electricthinking.com";
const TEST_EMAIL = `e2e-test-${Date.now()}@test.electricthinking.ai`;
const TEST_PASSWORD = "TestE2E123!";

// Session-aware fetch client
class TestClient {
  private cookies: string[] = [];
  constructor(private baseUrl: string) {}

  async request(method: string, path: string, body?: any) {
    const headers: Record<string, string> = {
      Cookie: this.cookies.join("; "),
    };
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    for (const cookie of setCookies) {
      const name = cookie.split("=")[0];
      this.cookies = this.cookies.filter(c => !c.startsWith(name + "="));
      this.cookies.push(cookie.split(";")[0]);
    }

    return res;
  }

  get(path: string) { return this.request("GET", path); }
  post(path: string, body?: any) { return this.request("POST", path, body); }
  patch(path: string, body?: any) { return this.request("PATCH", path, body); }
  delete(path: string) { return this.request("DELETE", path); }

  clearSession() { this.cookies = []; }
}

// Skip all tests if no running server
const runE2E = !!BASE_URL;

describe.skipIf(!runE2E)("E2E: Public Endpoints", () => {
  const client = new TestClient(BASE_URL!);

  test("GET /api/levels returns 5 levels", async () => {
    const res = await client.get("/api/levels");
    expect(res.status).toBe(200);
    const levels = await res.json();
    expect(levels).toHaveLength(5);
    expect(levels[0]).toHaveProperty("displayName");
    expect(levels[0]).toHaveProperty("sortOrder");
  });

  test("GET /api/skills returns 25 skills (5 per level)", async () => {
    const res = await client.get("/api/skills");
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(skills).toHaveLength(25);
    expect(skills[0]).toHaveProperty("name");
    expect(skills[0]).toHaveProperty("levelId");
  });

  test("GET /api/platforms returns platforms", async () => {
    const res = await client.get("/api/platforms");
    expect(res.status).toBe(200);
    const platforms = await res.json();
    expect(platforms.length).toBeGreaterThanOrEqual(4);
  });
});

describe.skipIf(!runE2E)("E2E: Authentication Flow", () => {
  const client = new TestClient(BASE_URL!);

  test("GET /api/auth/me without login returns 401", async () => {
    const res = await client.get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await client.post("/api/auth/login", {
      email: ADMIN_EMAIL,
      password: "wrong-password-definitely",
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/register creates a new user", async () => {
    const res = await client.post("/api/auth/register", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "E2E Test User",
    });
    expect(res.status).toBe(200);
    const user = await res.json();
    expect(user.email).toBe(TEST_EMAIL);
    expect(user).not.toHaveProperty("password"); // Should not leak password hash
  });

  test("GET /api/auth/me after register returns user", async () => {
    const res = await client.get("/api/auth/me");
    expect(res.status).toBe(200);
    const me = await res.json();
    expect(me.email).toBe(TEST_EMAIL);
  });

  test("POST /api/auth/logout ends session", async () => {
    const res = await client.post("/api/auth/logout");
    expect(res.status).toBe(200);

    const meRes = await client.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });

  test("POST /api/auth/login with correct credentials", async () => {
    const res = await client.post("/api/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
  });
});

describe.skipIf(!runE2E)("E2E: Full Assessment Lifecycle", () => {
  const client = new TestClient(BASE_URL!);
  let assessmentId: number;

  beforeAll(async () => {
    // Login as test user
    await client.post("/api/auth/login", {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
  });

  test("POST /api/assessment/start creates assessment", async () => {
    const res = await client.post("/api/assessment/start");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("id");
    expect(data.status).toBe("in_progress");
    assessmentId = data.id;
  });

  test("GET /api/assessment/active returns the in-progress assessment", async () => {
    const res = await client.get("/api/assessment/active");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(assessmentId);
    expect(data.status).toBe("in_progress");
  });

  test("POST /api/assessment/:id/message sends and receives messages", async () => {
    const res = await client.post(`/api/assessment/${assessmentId}/message`, {
      message: "I work as a project manager at a tech company. My typical week involves sprint planning, stakeholder meetings, and writing status reports.",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toBeDefined();
    expect(data.messages.length).toBeGreaterThanOrEqual(2); // user + AI response
  }, 30000); // AI response can take time

  test("GET /api/assessment/voice-available returns boolean", async () => {
    const res = await client.get("/api/assessment/voice-available");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.available).toBe("boolean");
  });

  test("POST /api/assessment/:id/complete triggers scoring", async () => {
    const res = await client.post(`/api/assessment/${assessmentId}/complete`);
    expect(res.status).toBe(200);
  }, 60000); // Scoring takes time (Claude API call)

  test("GET /api/assessment/latest returns scored assessment", async () => {
    // Wait for scoring to complete
    await new Promise(r => setTimeout(r, 5000));

    const res = await client.get("/api/assessment/latest");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(assessmentId);
    expect(data.status).toBe("completed");
    // These are the fields that were missing due to schema drift
    expect(data).toHaveProperty("workContextSummary");
    expect(data).toHaveProperty("outcomeOptionsJson");
    expect(data).toHaveProperty("nextLevelIdentity");
    expect(data).toHaveProperty("assessmentLevel");
    expect(data.scoresJson).toBeDefined();
  }, 15000);

  test("GET /api/user/skills returns skill statuses after assessment", async () => {
    const res = await client.get("/api/user/skills");
    expect(res.status).toBe(200);
    const skills = await res.json();
    expect(Array.isArray(skills)).toBe(true);
    // After scoring, some skills should have statuses
    expect(skills.length).toBeGreaterThan(0);
  });
});

describe.skipIf(!runE2E)("E2E: Admin Endpoints", () => {
  const adminClient = new TestClient(BASE_URL!);

  beforeAll(async () => {
    await adminClient.post("/api/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
  });

  test("GET /api/admin/system-health returns health data", async () => {
    const res = await adminClient.get("/api/admin/system-health");
    expect(res.status).toBe(200);
    const health = await res.json();
    expect(health).toHaveProperty("userCount");
    expect(health).toHaveProperty("assessmentCount");
    expect(health.userCount).toBeGreaterThan(0);
  });

  test("GET /api/admin/users lists users", async () => {
    const res = await adminClient.get("/api/admin/users");
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThan(0);
    // Should not leak password hashes
    for (const user of users) {
      expect(user.password).toBeUndefined();
    }
  });

  test("GET /api/admin/config/:key returns config", async () => {
    const res = await adminClient.get("/api/admin/config/assessment_conversation_guide");
    expect(res.status).toBe(200);
    const config = await res.json();
    expect(config.value).toContain("Lex");
  });

  test("GET /api/admin/analytics returns data", async () => {
    const res = await adminClient.get("/api/admin/analytics");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("totalUsers");
    expect(data).toHaveProperty("totalAssessments");
  });
});

describe.skipIf(!runE2E)("E2E: Cleanup", () => {
  const adminClient = new TestClient(BASE_URL!);

  beforeAll(async () => {
    await adminClient.post("/api/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
  });

  test("Delete test user", async () => {
    // Find test user
    const usersRes = await adminClient.get("/api/admin/users");
    const users = await usersRes.json();
    const testUser = users.find((u: any) => u.email === TEST_EMAIL);

    if (testUser) {
      const res = await adminClient.delete(`/api/admin/users/${testUser.id}`);
      expect(res.status).toBe(200);
    }
  });
});
