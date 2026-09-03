import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// A crashed component used to take the whole SPA down to a blank page with a
// console-only error (e.g. "Iterator value 0 is not an entry object"). Catch it
// here, keep the shell alive, and show the human something actionable.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Breadcrumb in the console for support, without dumping a raw stack at the user.
    console.error("UI crashed:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto my-16 max-w-xl rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-red-600" />
          <h2 className="mt-3 text-lg font-semibold text-red-900">Something went wrong on this page</h2>
          <p className="mt-2 text-sm leading-6 text-red-800">
            The page hit an unexpected error and could not continue. Your saved progress is kept — reload to try again.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-red-700">{String(this.state.error?.message || this.state.error)}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" onClick={() => window.location.reload()}>
              <RotateCcw /> Reload page
            </Button>
            {this.props.onReset && (
              <Button type="button" variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
