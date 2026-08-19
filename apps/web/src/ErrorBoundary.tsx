import React from "react";
import { Button } from "@fluentui/react-components";
import { ErrorCircleRegular } from "@fluentui/react-icons";

export function AppErrorFallback({ onReset }: { onReset: () => void }) {
  return <main className="fatal-error" role="alert" aria-labelledby="fatal-error-title"><section><span aria-hidden="true"><ErrorCircleRegular /></span><p className="eyebrow">Application recovery</p><h1 id="fatal-error-title">The workspace stopped responding</h1><p>Reload the page to restore the workspace. No save operation was triggered by this error.</p><Button appearance="primary" onClick={onReset}>Reload workspace</Button></section></main>;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("Uncaught workspace error", error, info.componentStack); }
  render() { return this.state.failed ? <AppErrorFallback onReset={() => window.location.reload()} /> : this.props.children; }
}
