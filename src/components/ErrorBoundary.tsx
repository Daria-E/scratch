import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled window error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-bg text-text p-8">
        <div className="text-lg font-medium">
          Something went wrong in this window
        </div>
        <pre className="max-w-xl max-h-56 overflow-auto text-xs text-text-muted bg-bg-muted rounded-md p-3 whitespace-pre-wrap select-text">
          {String(this.state.error.stack ?? this.state.error)}
        </pre>
        <Button onClick={() => window.location.reload()}>Reload window</Button>
      </div>
    );
  }
}
