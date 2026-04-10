import { Component, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { Wordmark } from "./wordmark";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  eventId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, eventId: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, eventId: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info.componentStack);
    const eventId = Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
    this.setState({ eventId });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, eventId: null });
  };

  private handleReport = () => {
    const { error, eventId } = this.state;
    const subject = encodeURIComponent("Issue report: Electric Thinking");
    const body = encodeURIComponent(
      [
        `Error: ${error?.message || "Unknown error"}`,
        `Sentry ID: ${eventId || "N/A"}`,
        `URL: ${window.location.href}`,
        `Time: ${new Date().toISOString()}`,
        `Browser: ${navigator.userAgent}`,
        "",
        "Please describe what you were doing when this happened:",
        "",
      ].join("\n")
    );
    window.open(`mailto:support@electricthinking.com?subject=${subject}&body=${body}`, "_blank");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <Wordmark className="text-xl mb-8 block" />
            <p className="font-heading text-xl font-semibold mb-3">
              Something went wrong
            </p>
            <p className="text-muted-foreground text-sm mb-6">
              Click below to try again. If the problem persists, let us know.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground px-6 py-3 text-sm font-medium"
              >
                Try again
              </button>
              <button
                onClick={this.handleReport}
                className="inline-flex items-center justify-center rounded-2xl border border-border text-muted-foreground px-6 py-3 text-sm font-medium hover:text-foreground transition-colors"
              >
                Report this issue
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
