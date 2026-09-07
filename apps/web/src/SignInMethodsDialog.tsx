import React, { useEffect, useRef, useState } from "react";
import {
  Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface,
  DialogTitle, Field, Input, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { authClient, authFailureMessage, authTransportUrl } from "./auth";

// Platform Core owns personal identity. Managed Auth verifies email ownership.
const useStyles = makeStyles({
  content: { display: "grid", gap: tokens.spacingVerticalM },
  email: { overflowWrap: "anywhere" },
  form: { display: "grid", gap: tokens.spacingVerticalM },
});
async function accountStatus(email: string) {
  if (!authClient) throw new Error("Auth unavailable");
  const [accounts, response] = await Promise.all([
    authClient.listAccounts(),
    fetch(`${authTransportUrl}/get-session`, { credentials: "include", cache: "no-store", headers: { "x-force-fetch": "true" } }),
  ]);
  if (accounts.error) throw accounts.error;
  if (!response.ok) throw new Error("Session unavailable");
  const session = await response.json();
  if (session?.user?.email !== email) throw new Error("Session identity changed");
  return { linked: accounts.data?.some(account => account.providerId === "google") ?? false, verified: session.user.emailVerified === true };
}
export default function SignInMethodsDialog({
  email, initialError = "", onClose,
}: { email: string; initialError?: string; onClose: () => void }) {
  const styles = useStyles();
  const focusSource = useRestoreFocusSource();
  const closeButton = useRef<HTMLButtonElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    void accountStatus(email).then(status => {
      if (active) { setLinked(status.linked); setVerified(status.verified); }
    }).catch(reason => { if (active) setLoadError(authFailureMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [email, attempt]);
  useEffect(() => { if (codeSent && !verified && !busy) codeInput.current?.focus(); }, [codeSent, verified, busy]);
  useEffect(() => { if (verified && !busy) closeButton.current?.focus(); }, [verified, busy]);

  async function sendCode() {
    if (!authClient || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: new URL("/?sign_in_methods=1", window.location.origin).href });
      if (result.error) throw result.error;
      setCodeSent(true);
      codeInput.current?.focus();
    } catch (reason) { setError(authFailureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!authClient || busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() });
      if (result.error) throw result.error;
      const status = await accountStatus(email);
      if (!status.verified) { setError("Email verification has not been confirmed. Check the code and try again."); return; }
      closeButton.current?.focus();
      setVerified(true);
      setLinked(status.linked);
      setCode("");
      setCodeSent(false);
    } catch (reason) { setError(authFailureMessage(reason)); }
    finally { setBusy(false); }
  }
  async function continueWithGoogle() {
    if (!authClient || busy || loading || !verified || linked || loadError) return;
    setBusy(true);
    setError("");
    try {
      const callbackURL = new URL("/?sign_in_methods=1", window.location.origin).href;
      // Social sign-in uses Neon's hosted init handoff. Do not use linkSocial through this proxy.
      const result = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: callbackURL });
      if (result.error) throw result.error;
    } catch (reason) { setError(authFailureMessage(reason)); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={(_, data) => { if (!data.open && !busy) onClose(); }}>
    <DialogSurface {...focusSource}>
      <DialogBody>
        <DialogTitle>Sign-in methods</DialogTitle>
        <DialogContent className={styles.content}>
          <Text className={styles.email}>Account: {email}</Text>
          {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
          {loading ? <Spinner size="small" label="Loading sign-in methods" /> : loadError ?
            <MessageBar intent="error"><MessageBarBody>{loadError} <Button appearance="transparent" onClick={() => { closeButton.current?.focus(); setAttempt(value => value + 1); }}>Retry</Button></MessageBarBody></MessageBar> :
            linked ? <MessageBar intent="success"><MessageBarBody>Google is connected. You can use Continue with Google next time you sign in.</MessageBarBody></MessageBar> :
            verified ? <Text>Your email is verified. Continue with the Google account that uses this same email address.</Text> :
            <Text>Verify your email address, then try Google sign-in again using the same email.</Text>}
          {codeSent && !verified && <form className={styles.form} onSubmit={event => void verifyCode(event)}>
            <MessageBar intent="info"><MessageBarBody>Check your inbox for the verification code. It expires after 15 minutes.</MessageBarBody></MessageBar>
            <Field label="Verification code" required>
              <Input ref={codeInput} value={code} onChange={(_, data) => setCode(data.value)} inputMode="numeric" autoComplete="one-time-code" required disabled={busy} />
            </Field>
            <Button type="submit" appearance="primary" disabled={busy || !code.trim()}>{busy ? "Verifying…" : "Verify email"}</Button>
          </form>}
        </DialogContent>
        <DialogActions>
          {!loading && !loadError && !linked && (verified ?
            <Button appearance="primary" disabled={busy} onClick={() => void continueWithGoogle()}>{busy ? "Continuing…" : "Continue with Google"}</Button> :
            <Button appearance={codeSent ? "secondary" : "primary"} disabled={busy} onClick={() => void sendCode()}>{codeSent ? "Resend code" : "Send verification code"}</Button>)}
          <Button ref={closeButton} appearance="secondary" disabled={busy} onClick={onClose}>Close</Button>
        </DialogActions>
      </DialogBody>
    </DialogSurface>
  </Dialog>;
}
