import { test, expect } from "@playwright/test";

/**
 * Regression test for the April 24 "Lex keeps going again and again" bug.
 *
 * ROOT CAUSE: The auto-connect useEffect in assessment.tsx had
 * `voiceConnected, voiceConnecting, voiceError` in its dependency array.
 * When a WebSocket closed (for any reason), `setVoiceConnected(false)` tripped
 * the dep change, the guard passed again, and a BRAND NEW `connectVoice()`
 * call fired — which fetched a new signed URL and spawned a new EL agent.
 * Each new agent greeted the user from scratch, producing the "repeating Lex"
 * symptom. The fix adds an `autoConnectAttemptedRef` that ensures auto-connect
 * fires exactly once per voiceMode="full-duplex" session.
 *
 * THIS TEST: Intercepts `/api/assessment/voice-token` and counts hits. After
 * simulating a WS failure, we wait 10s and verify the endpoint was called at
 * most 3 times (1 initial + at most 2 retries). If the bug regresses, we'd
 * see 5+ hits as the useEffect keeps re-firing connectVoice.
 *
 * REQUIRES: an authenticated test user with a completed survey. The cleanest
 * setup is an admin-API seeded test account.
 *
 * USAGE:
 *   E2E_BASE_URL=https://staging.electricthinking.ai \
 *   E2E_TEST_USER_EMAIL=playwright-test@electricthinking.ai \
 *   E2E_TEST_USER_PASSWORD=... \
 *   npx playwright test e2e/voice-regression.spec.ts
 *
 * This test is SKIPPED by default until E2E_TEST_USER_EMAIL is set so CI
 * doesn't fail on a missing secret. Remove the `test.skip()` once you've
 * created the test user.
 */
test("voice auto-connect does NOT re-fire on WebSocket disconnect", async ({ page }) => {
  test.skip(!process.env.E2E_TEST_USER_EMAIL, "E2E_TEST_USER_EMAIL not set — create a test account and export the env var.");

  // Count how many times voice-token is fetched. More than 3 = regression.
  let voiceTokenHits = 0;
  await page.route("**/api/assessment/voice-token", async (route) => {
    voiceTokenHits++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // Intentionally invalid — WS will fail to connect, exercising the error path
      body: JSON.stringify({ signedUrl: "wss://invalid-host-regression-test.example.com/fake" }),
    });
  });

  // Log in
  await page.goto("/login");
  await page.fill("input[type=email]", process.env.E2E_TEST_USER_EMAIL!);
  await page.fill("input[type=password]", process.env.E2E_TEST_USER_PASSWORD!);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/(dashboard|assessment|survey)/);

  // Navigate directly to voice assessment mode. Requires the user to already
  // have completed the survey (survey is gated before assessment).
  await page.goto("/assessment?mode=voice");

  // Wait long enough for any pathological reconnect loop to manifest.
  // With the fix: ~1 fetch. Without: 10+ in this window.
  await page.waitForTimeout(10_000);

  expect(voiceTokenHits, `voice-token hit ${voiceTokenHits} times — expected ≤ 3`).toBeLessThanOrEqual(3);
});

/**
 * Smoke test: app loads and renders the login page.
 *
 * This is the minimal "the framework works" test. Always runs. If this fails,
 * something's broken at the app-build level (bundler, static serving, etc).
 */
test("app loads and shows login page", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading")).toBeVisible();
  // Page should have email + password inputs
  await expect(page.locator("input[type=email]")).toBeVisible();
  await expect(page.locator("input[type=password]")).toBeVisible();
});
