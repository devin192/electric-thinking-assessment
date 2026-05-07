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
      // Record 1-in-10 sessions (plus 100% of errored sessions) so we can see what
      // users actually experienced. Our bugs often manifest without throwing
      // (greeting loops, UI flickering, state races). Sentry Developer tier = 50
      // replays/mo hard cap, no PAYG by default — 25% sampling burned 80% of the
      // budget in 13 days during the ABC ramp. 10% projects to ~37/mo with
      // headroom. Bump back to 0.25 or 1.0 temporarily when actively chasing a bug,
      // then drop it. Errors are always captured at 100%.
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
    replaysSessionSampleRate: 0.10,
    replaysOnErrorSampleRate: 1.0,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
