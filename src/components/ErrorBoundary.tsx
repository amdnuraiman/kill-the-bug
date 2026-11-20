import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected runtime error.',
    };
  }

  componentDidCatch(error: Error): void {
    console.error('killthebug ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#130b20] p-6 text-white">
          <div className="manga-panel-gold max-w-lg rounded-2xl border-2 border-slate-950 bg-[#1e1233] p-6">
            <h1 className="font-anime text-3xl font-black italic uppercase text-amber-300">
              Stand Disruption Detected
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              Something interrupted the defense session. You can reload to resume playing.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg border border-white/10 bg-slate-950 p-3 text-xs text-rose-300">
              {this.state.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="manga-panel mt-4 rounded-xl border-2 border-slate-950 bg-amber-400 px-5 py-2 font-anime text-xl font-black uppercase text-slate-950"
            >
              Reload killthebug
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
