import React from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-card">
        <h2>{this.props.title || "Viewer"} failed to render</h2>
        <p className="ggt-error">{this.state.error.message}</p>
      </div>
    );
  }
}
