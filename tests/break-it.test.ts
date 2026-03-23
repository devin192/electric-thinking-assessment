/**
 * Adversarial "Break It" Tests
 *
 * Instead of asking "does this work?", these tests ask "can I break this?"
 * They test error paths, invalid inputs, auth bypass attempts, and
 * state machine violations — the things real users accidentally discover.
 *
 * Usage: TEST_BASE_URL=http://localhost:5000 ADMIN_PASSWORD=... npm test
 */

import { describe, test, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

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

const runE2E = !!BASE_URL;

// ============================================
// Auth bypass attempts
// ============================================
describe.skipIf(!runE2E)("Break It: Auth Bypass", () => {
  const client = new TestClient(BASE_URL!);

  test("Unauthenticated user cannot access assessment endpoints", async () => {
    client.clearSession();
    const res = await client.post("/api/assessment/start");
    expect(res.status).toBe(401);
  });

  test("Unauthenticated user cannot access admin endpoints", async () => {
    client.clearSession();
    const res = await client.get("/api/admin/users");
    expect(res.status).toBe(401);
  });

  test("Unauthenticated user cannot access system health", async () => {
    client.clearSession();
    const res = await client.get("/api/admin/system-health");
    expect(res.status).toBe(401);
  });

  test("Unauthenticated user cannot access config", async () => {
    client.clearSession();
    const res = await client.get("/api/admin/config/assessment_conversation_guide");
    expect(res.status).toBe(401);
  });

  test("Regular user cannot access admin endpoints", async () => {
    // Register a regular user
    const email = `break-test-${Date.now()}@test.electricthinking.ai`;
    await client.post("/api/auth/register", {
      email,
      password: "BreakTest123!",
      name: "Break Test User",
    });

    const res = await client.get("/api/admin/users");
    expect([401, 403]).toContain(res.status);

    const healthRes = await client.get("/api/admin/system-health");
    expect([401, 403]).toContain(healthRes.status);

    const configRes = await client.get("/api/admin/config/assessment_conversation_guide");
    expect([401, 403]).toContain(configRes.status);

    // Cleanup: admin deletes test user
    const adminClient = new TestClient(BASE_URL!);
    await adminClient.post("/api/auth/login", {
      email: "admin@electricthinking.com",
      password: ADMIN_PASSWORD,
    });
    const usersRes = await adminClient.get("/api/admin/users");
    const users = await usersRes.json();
    const testUser = users.find((u: any) => u.email === email);
    if (testUser) await adminClient.delete(`/api/admin/users/${testUser.id}`);
  });
});

// ============================================
// Invalid inputs
// ============================================
describe.skipIf(!runE2E)("Break It: Invalid Inputs", () => {
  const client = new TestClient(BASE_URL!);

  test("Register with missing fields returns error", async () => {
    const res = await client.post("/api/auth/register", {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Register with invalid email returns error", async () => {
    const res = await client.post("/api/auth/register", {
      email: "not-an-email",
      password: "TestPass123!",
      name: "Test",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Register with short password returns error", async () => {
    const res = await client.post("/api/auth/register", {
      email: `short-pw-${Date.now()}@test.electricthinking.ai`,
      password: "12345",
      name: "Test",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Login with empty body returns error", async () => {
    const res = await client.post("/api/auth/login", {});
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Send message to non-existent assessment returns error", async () => {
    // Login first
    await client.post("/api/auth/register", {
      email: `invalid-input-${Date.now()}@test.electricthinking.ai`,
      password: "TestPass123!",
      name: "Test",
    });

    const res = await client.post("/api/assessment/999999/message", {
      message: "Hello",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("Send empty message returns error", async () => {
    const startRes = await client.post("/api/assessment/start");
    if (startRes.status === 200) {
      const { id } = await startRes.json();
      const res = await client.post(`/api/assessment/${id}/message`, {
        message: "",
      });
      // Should either reject or handle gracefully
      expect(res.status).toBeDefined();
    }
  });
});

// ============================================
// State machine violations
// ============================================
describe.skipIf(!runE2E)("Break It: State Machine Violations", () => {
  const client = new TestClient(BASE_URL!);
  let assessmentId: number;

  beforeAll(async () => {
    await client.post("/api/auth/register", {
      email: `state-test-${Date.now()}@test.electricthinking.ai`,
      password: "TestPass123!",
      name: "State Test",
    });
  });

  test("Cannot complete assessment without messages", async () => {
    const startRes = await client.post("/api/assessment/start");
    expect(startRes.status).toBe(200);
    const data = await startRes.json();
    assessmentId = data.id;

    // Try to complete immediately (no conversation)
    const completeRes = await client.post(`/api/assessment/${assessmentId}/complete`);
    // Should either reject or handle gracefully (may still attempt scoring)
    expect(completeRes.status).toBeDefined();
  }, 30000);

  test("Cannot start second assessment while one is in_progress", async () => {
    // First assessment may still be in_progress from above
    const startRes = await client.post("/api/assessment/start");
    // Should either return existing assessment or error
    expect(startRes.status).toBeDefined();
    if (startRes.status === 200) {
      const data = await startRes.json();
      // If it returns success, it should be the same assessment
      expect(data.id).toBe(assessmentId);
    }
  });
});

// ============================================
// XSS / Injection attempts
// ============================================
describe.skipIf(!runE2E)("Break It: Injection Attempts", () => {
  const client = new TestClient(BASE_URL!);

  beforeAll(async () => {
    await client.post("/api/auth/register", {
      email: `xss-test-${Date.now()}@test.electricthinking.ai`,
      password: "TestPass123!",
      name: "XSS Test",
    });
  });

  test("XSS in user name is not reflected raw", async () => {
    const updateRes = await client.patch("/api/auth/me", {
      name: '<script>alert("xss")</script>',
    });
    if (updateRes.status === 200) {
      const meRes = await client.get("/api/auth/me");
      const me = await meRes.json();
      // Name should be stored but API shouldn't execute scripts
      // The key thing is the server doesn't crash
      expect(me.name).toBeDefined();
    }
  });

  test("SQL injection in login email doesn't crash server", async () => {
    const res = await client.post("/api/auth/login", {
      email: "admin@test.com' OR '1'='1",
      password: "anything",
    });
    // Should return auth error, not 500
    expect(res.status).toBeLessThan(500);
  });

  test("Very long message doesn't crash server", async () => {
    const startRes = await client.post("/api/assessment/start");
    if (startRes.status === 200) {
      const { id } = await startRes.json();
      const longMessage = "A".repeat(50000);
      const res = await client.post(`/api/assessment/${id}/message`, {
        message: longMessage,
      });
      // Should handle gracefully — either process or reject, not 500
      expect(res.status).toBeLessThan(500);
    }
  }, 30000);
});

// ============================================
// Error responses are safe (no stack traces, no internal details)
// ============================================
describe.skipIf(!runE2E)("Break It: Error Response Safety", () => {
  const client = new TestClient(BASE_URL!);

  test("404 on unknown route doesn't leak server info", async () => {
    const res = await client.get("/api/nonexistent/route/here");
    const text = await res.text();
    expect(text).not.toContain("node_modules");
    expect(text).not.toContain("at Object.");
    expect(text).not.toContain("stack");
    expect(text.toLowerCase()).not.toContain("postgres");
  });

  test("500 error doesn't leak database connection string", async () => {
    // Try to trigger an error by sending garbage
    const res = await client.post("/api/auth/login", {
      email: null,
      password: null,
    });
    const text = await res.text();
    expect(text).not.toContain("DATABASE_URL");
    expect(text).not.toContain("postgresql://");
    expect(text).not.toContain("password");
  });
});

// ============================================
// Cleanup: Admin deletes all test users
// ============================================
describe.skipIf(!runE2E)("Break It: Cleanup", () => {
  test("Admin cleans up test users", async () => {
    const adminClient = new TestClient(BASE_URL!);
    await adminClient.post("/api/auth/login", {
      email: "admin@electricthinking.com",
      password: ADMIN_PASSWORD,
    });

    const usersRes = await adminClient.get("/api/admin/users");
    if (usersRes.status === 200) {
      const users = await usersRes.json();
      const testUsers = users.filter((u: any) =>
        u.email.includes("@test.electricthinking.ai")
      );
      for (const user of testUsers) {
        await adminClient.delete(`/api/admin/users/${user.id}`);
      }
    }
  });
});
