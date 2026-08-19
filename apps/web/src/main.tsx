import React from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./auth.css";
import "./operations.css";
import "./clients.css";
import "./production.css";
import "./team.css";
import "./commercial.css";
import "./fluent-cleanup.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FluentProvider theme={webLightTheme}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </FluentProvider>
  </React.StrictMode>,
);
