import React from "react";
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
} from "@fluentui/react-components";

export function RoutePanelFallback({ onRetry }: { onRetry: () => void }) {
  return (
    <section aria-label="Panel recovery">
      <MessageBar intent="error">
        <MessageBarBody>
          This section could not be displayed. Your saved data is unchanged.
        </MessageBarBody>
        <MessageBarActions>
          <Button appearance="transparent" onClick={onRetry}>
            Try again
          </Button>
        </MessageBarActions>
      </MessageBar>
    </section>
  );
}

export class RoutePanelBoundary extends React.Component<
  React.PropsWithChildren<{ resetKey: string }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Route panel error", error, info.componentStack);
  }

  componentDidUpdate(previous: Readonly<React.PropsWithChildren<{ resetKey: string }>>) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? (
      <RoutePanelFallback onRetry={() => this.setState({ failed: false })} />
    ) : (
      this.props.children
    );
  }
}
