import React, { useEffect, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface,
  DialogTitle, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { authClient, authFailureMessage } from "./auth";

// Platform Core owns personal sign-in methods; tenant roles and entitlements are unchanged.
const useStyles = makeStyles({
  content: { display: "grid", gap: tokens.spacingVerticalM },
  email: { overflowWrap: "anywhere" },
});

export default function SignInMethodsDialog({
  email, initialError = "", onClose,
}: { email: string; initialError?: string; onClose: () => void }) {
  const styles = useStyles();
  const focusSource = useRestoreFocusSource();
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    if (!authClient) {
      setLoadError("Sign-in methods are unavailable. Sign in again and retry.");
      setLoading(false);
      return;
    }
    void authClient.listAccounts().then(result => {
      if (!active) return;
      if (result.error) throw result.error;
      setLinked(result.data?.some(account => account.providerId === "google") ?? false);
    }).catch(reason => {
      if (active) setLoadError(authFailureMessage(reason));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  async function connectGoogle() {
    if (!authClient || busy || loading || linked || loadError) return;
    setBusy(true);
    setError("");
    try {
      const callback = new URL("/", window.location.origin);
      callback.searchParams.set("sign_in_methods", "1");
      const result = await authClient.linkSocial({ provider: "google", callbackURL: callback.href });
      if (result.error) throw result.error;
    } catch (reason) {
      setError(authFailureMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !busy) onClose(); }}>
    <DialogSurface {...focusSource}>
      <DialogBody>
        <DialogTitle>Sign-in methods</DialogTitle>
        <DialogContent className={styles.content}>
          <Text className={styles.email}>Account: {email}</Text>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {loading ? <Spinner size="small" label="Loading sign-in methods" /> : loadError ?
            <MessageBar intent="error"><MessageBarBody>{loadError} <Button appearance="transparent" onClick={() => setAttempt(value => value + 1)}>Retry</Button></MessageBarBody></MessageBar> :
            linked ? <MessageBar intent="success"><MessageBarBody>Google is connected. You can use Continue with Google next time you sign in.</MessageBarBody></MessageBar> :
            <Text>Connect the Google account that uses this same email address. You will confirm the connection with Google and keep your existing account and work.</Text>}
        </DialogContent>
        <DialogActions>
          {!linked && <Button appearance="primary" disabled={loading || busy || Boolean(loadError)} onClick={() => void connectGoogle()}>{busy ? "Connecting…" : "Connect Google"}</Button>}
          <Button appearance="secondary" disabled={busy} onClick={onClose}>Close</Button>
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>;
}
