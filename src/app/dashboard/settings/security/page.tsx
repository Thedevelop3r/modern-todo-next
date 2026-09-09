"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  History,
  KeyRound,
  Laptop,
  LogOut,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from "lucide-react";
import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  PageTransition,
  Spinner,
  useToast,
} from "@/components/ui";
import { Section, SettingsTabs } from "@/components/settings/SettingsSection";
import { useMe } from "@/hooks/useAuth";
import {
  useAuditLog,
  useDeleteAccount,
  useDisableTwoFactor,
  useEnableTwoFactor,
  useRevokeAllSessions,
  useRevokeSession,
  useSessions,
  useStartTwoFactor,
} from "@/hooks/useAccount";
import { formatDateTime, relativeTime } from "@/lib/date";

/** Audit actions read as sentences rather than dotted keys. */
const AUDIT_LABEL: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  "login.2fa_failed": "Failed two-factor code",
  "password.changed": "Password changed",
  "sessions.revoked_all": "All sessions revoked",
  "session.revoked": "A session was revoked",
  "2fa.enabled": "Two-factor authentication turned on",
  "2fa.disabled": "Two-factor authentication turned off",
  "export.todos": "Todos exported",
  "export.account": "Account exported",
  "import.todos": "Todos imported",
  "sample_data.created": "Sample data added",
};

/** "Chrome on macOS" out of a user-agent string, without a parser library. */
function describeDevice(userAgent = "") {
  const browser =
    /edg/i.test(userAgent) ? "Edge"
    : /chrome|crios/i.test(userAgent) ? "Chrome"
    : /firefox|fxios/i.test(userAgent) ? "Firefox"
    : /safari/i.test(userAgent) ? "Safari"
    : "Browser";

  const platform =
    /iphone|ipad/i.test(userAgent) ? "iOS"
    : /android/i.test(userAgent) ? "Android"
    : /mac os/i.test(userAgent) ? "macOS"
    : /windows/i.test(userAgent) ? "Windows"
    : /linux/i.test(userAgent) ? "Linux"
    : "Unknown device";

  return `${browser} on ${platform}`;
}

export default function SecuritySettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { data: user } = useMe();

  const sessions = useSessions();
  const revokeSession = useRevokeSession();
  const revokeAll = useRevokeAllSessions();
  const audit = useAuditLog();

  const startTwoFactor = useStartTwoFactor();
  const enableTwoFactor = useEnableTwoFactor();
  const disableTwoFactor = useDisableTwoFactor();
  const deleteAccount = useDeleteAccount();

  const [setup, setSetup] = React.useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [disableOpen, setDisableOpen] = React.useState(false);
  const [disablePassword, setDisablePassword] = React.useState("");
  const [confirmRevokeAll, setConfirmRevokeAll] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteForm, setDeleteForm] = React.useState({ password: "", confirm: "" });

  const twoFactorOn = Boolean(user?.twoFactor?.enabled);

  const beginSetup = () =>
    startTwoFactor.mutate(undefined, {
      onSuccess: (result) => {
        setSetup(result);
        setCode("");
      },
      onError: (error: Error) => toast.error("Could not start setup", { description: error.message }),
    });

  const finishSetup = () =>
    enableTwoFactor.mutate(code, {
      onSuccess: (result) => {
        setSetup(null);
        setCode("");
        setRecoveryCodes(result.recoveryCodes);
        toast.success("Two-factor authentication is on");
      },
      onError: (error: Error) => toast.error("That did not work", { description: error.message }),
    });

  const copy = (text: string, what: string) =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success(`${what} copied`))
      .catch(() => toast.error("Could not copy to the clipboard"));

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <SettingsTabs />

      <Section
        icon={<Laptop className="h-4.5 w-4.5" />}
        title="Signed-in devices"
        description="Every sign-in is a session. Revoking one signs that device out immediately."
      >
        {sessions.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(sessions.data || []).map((session) => (
              <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {describeDevice(session.userAgent)}
                    {session.current && (
                      <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-fg-subtle">
                    {session.ip || "unknown address"} · last seen {relativeTime(session.lastSeenAt)}
                  </p>
                </div>
                {!session.current && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      revokeSession.mutate(session.id, {
                        onSuccess: () => toast.success("Session revoked"),
                        onError: (error: Error) =>
                          toast.error("Could not revoke", { description: error.message }),
                      })
                    }
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setConfirmRevokeAll(true)}>
            <LogOut className="h-4 w-4" />
            Sign out everywhere
          </Button>
        </div>
      </Section>

      <Section
        icon={twoFactorOn ? <ShieldCheck className="h-4.5 w-4.5" /> : <ShieldOff className="h-4.5 w-4.5" />}
        title="Two-factor authentication"
        description={
          twoFactorOn
            ? "Sign-in asks for a code from your authenticator app."
            : "Add a six-digit code from an authenticator app to every sign-in."
        }
      >
        {twoFactorOn ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-fg-muted">
              On since {user?.twoFactor?.enabledAt ? formatDateTime(user.twoFactor.enabledAt) : "recently"}.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setDisableOpen(true)}>
              Turn off
            </Button>
          </div>
        ) : setup ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              Add this secret to your authenticator app, then type the code it shows.
            </p>

            <div className="rounded-lg border border-border bg-surface-sunken p-3">
              <p className="text-xs text-fg-subtle">Secret</p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-fg">{setup.secret}</code>
                <Button size="sm" variant="ghost" onClick={() => copy(setup.secret, "Secret")}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 break-all text-[11px] text-fg-subtle">{setup.otpauthUri}</p>
            </div>

            <Field label="Code from the app" htmlFor="totp-code">
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSetup(null)}>
                Cancel
              </Button>
              <Button size="sm" loading={enableTwoFactor.isPending} disabled={code.length < 6} onClick={finishSetup}>
                Turn on
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" loading={startTwoFactor.isPending} onClick={beginSetup}>
            <KeyRound className="h-4 w-4" />
            Set up two-factor
          </Button>
        )}
      </Section>

      <Section
        icon={<History className="h-4.5 w-4.5" />}
        title="Account activity"
        description="Sign-ins, exports and security changes on this account."
      >
        {audit.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5" />
          </div>
        ) : audit.data?.data.length ? (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {audit.data.data.map((entry) => (
              <li key={entry._id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-fg">
                  {AUDIT_LABEL[entry.action] || entry.action}
                </span>
                <span className="shrink-0 text-xs text-fg-subtle" title={formatDateTime(entry.createdAt)}>
                  {relativeTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Nothing recorded yet.</p>
        )}
      </Section>

      <Section
        danger
        icon={<Trash2 className="h-4.5 w-4.5" />}
        title="Delete this account"
        description="Every todo, project, comment and file goes with it. There is no recovery."
      >
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </Section>

      {/* ---- dialogs ---- */}

      <Modal
        open={Boolean(recoveryCodes)}
        onOpenChange={(open) => !open && setRecoveryCodes(null)}
        title="Save your recovery codes"
        description="Each one signs you in once if you lose your authenticator. They are shown only now."
        footer={
          <>
            <Button variant="secondary" onClick={() => copy((recoveryCodes || []).join("\n"), "Recovery codes")}>
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button onClick={() => setRecoveryCodes(null)}>Done</Button>
          </>
        }
      >
        <ul className="grid grid-cols-2 gap-2">
          {(recoveryCodes || []).map((recovery) => (
            <li key={recovery} className="rounded-lg bg-surface-sunken px-3 py-2 text-center font-mono text-sm text-fg">
              {recovery}
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={disableOpen}
        onOpenChange={setDisableOpen}
        title="Turn off two-factor authentication"
        description="Confirm with your password. Your recovery codes stop working."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={disableTwoFactor.isPending}
              disabled={!disablePassword}
              onClick={() =>
                disableTwoFactor.mutate(disablePassword, {
                  onSuccess: () => {
                    setDisableOpen(false);
                    setDisablePassword("");
                    toast.success("Two-factor authentication is off");
                  },
                  onError: (error: Error) => toast.error("Could not turn it off", { description: error.message }),
                })
              }
            >
              Turn off
            </Button>
          </>
        }
      >
        <Field label="Password" htmlFor="disable-password">
          <Input
            id="disable-password"
            type="password"
            autoComplete="current-password"
            value={disablePassword}
            onChange={(e) => setDisablePassword(e.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmRevokeAll}
        onOpenChange={setConfirmRevokeAll}
        title="Sign out of every device?"
        description="This device included - you will be asked to sign in again."
        confirmLabel="Sign out everywhere"
        loading={revokeAll.isPending}
        onConfirm={() =>
          revokeAll.mutate(undefined, {
            onSuccess: () => router.replace("/login"),
            onError: (error: Error) => toast.error("Could not revoke", { description: error.message }),
          })
        }
      />

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete your account"
        description="This erases everything immediately and cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={deleteAccount.isPending}
              disabled={!deleteForm.password || deleteForm.confirm !== "DELETE"}
              onClick={() =>
                deleteAccount.mutate(deleteForm, {
                  onSuccess: () => router.replace("/"),
                  onError: (error: Error) =>
                    toast.error("Could not delete the account", { description: error.message }),
                })
              }
            >
              Delete for ever
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Password" htmlFor="delete-password">
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={deleteForm.password}
              onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })}
            />
          </Field>
          <Field label="Type DELETE to confirm" htmlFor="delete-confirm">
            <Input
              id="delete-confirm"
              value={deleteForm.confirm}
              onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })}
              placeholder="DELETE"
            />
          </Field>
        </div>
      </Modal>
    </PageTransition>
  );
}
