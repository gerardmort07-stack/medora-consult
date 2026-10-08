import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold text-slate-800">Something went wrong</h1>
        <p className="max-w-md text-sm text-slate-500">
          The page hit an unexpected error. Please reload; if it keeps happening, contact support.
        </p>
        <button className="btn-primary" onClick={() => window.location.assign("/")}>
          Reload
        </button>
      </div>
    );
  }
}
