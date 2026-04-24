import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Record 1-in-4 sessions (plus 100% of errored sessions) so we can see what
      // users actually experienced. Our bugs often manifest without throwing
      // (greeting loops, UI flickering, state races). Sentry Team tier = 50 replays
      // baseline + pay-as-you-go. At ~30 users/day, 25% sampling ≈ 225/mo, overage
      // is typically <$2/mo. Bump the rate temporarily when actively chasing a bug.
      Sentry.replayIntegration({
        // Mask ALL text by default. Transcripts contain real customer/company
        // info (Jamie's session referenced specific show names + exec titles).
        // DOM structure, click sequences, and timing are still captured —
        // enough to debug most UI / state-machine bugs without the PII.
        maskAllText: true,
        maskAllInputs: true,
      }),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.25,
    replaysOnErrorSampleRate: 1.0,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
