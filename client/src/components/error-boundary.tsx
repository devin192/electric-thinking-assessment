import { Component, type ReactNode } from "react";
import { Wordmark } from "./wordmark";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App error:", error, info.componentStack);
  }

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
              Please refresh the page to try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground px-6 py-3 text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
