import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
} from "@fluentui/react-components";

type ButtonProps = React.ComponentProps<typeof Button>;

export function ConfirmAction({
  label,
  title,
  body,
  confirmLabel,
  onConfirm,
  appearance = "secondary",
  size = "small",
  disabled,
}: {
  label: string;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  appearance?: ButtonProps["appearance"];
  size?: ButtonProps["size"];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      modalType="alert"
      open={open}
      onOpenChange={(_, data) => !busy && setOpen(data.open)}
    >
      <DialogTrigger disableButtonEnhancement>
        <Button appearance={appearance} size={size} disabled={disabled}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{body}</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" disabled={busy}>
                Cancel
              </Button>
            </DialogTrigger>
            <Button appearance="primary" disabled={busy} onClick={confirm}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <Dialog
      modalType="alert"
      open={open}
      onOpenChange={(_, data) => !data.open && !busy && onCancel()}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{body}</DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button appearance="primary" disabled={busy} onClick={onConfirm}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
