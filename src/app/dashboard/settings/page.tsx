"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { CalendarDays, Columns3, KeyRound, LayoutGrid, List, Save, ShieldCheck, User } from "lucide-react";
import {
  AVATAR_OPTIONS,
  Avatar,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  NativeSelect,
  PageTransition,
  SegmentedControl,
  Switch,
  useToast,
} from "@/components/ui";
import { useChangePassword, useMe, useUpdatePreferences, useUpdateProfile } from "@/hooks/useAuth";
import { changePasswordSchema, passwordStrength, profileSchema } from "@/lib/validation";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS = [
  { value: "list" as const, label: "List", icon: <List className="h-3.5 w-3.5" /> },
  { value: "grid" as const, label: "Grid", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: "board" as const, label: "Board", icon: <Columns3 className="h-3.5 w-3.5" /> },
  { value: "calendar" as const, label: "Calendar", icon: <CalendarDays className="h-3.5 w-3.5" /> },
];

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            {icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Five-segment strength meter shown under new-password fields. */
function StrengthMeter({ password }: { password: string }) {
  const { score, label, hint } = passwordStrength(password);
  const colors = ["bg-danger", "bg-danger", "bg-warning", "bg-info", "bg-success"];

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn("h-1 flex-1 rounded-full transition-colors", index < score ? colors[score] : "bg-surface-sunken")}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">
        <span className="font-medium text-fg">{label}</span> · {hint}
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const { data: user } = useMe();

  const updateProfile = useUpdateProfile();
  const updatePreferences = useUpdatePreferences();
  const changePassword = useChangePassword();

  const [name, setName] = React.useState("");
  const [avatar, setAvatar] = React.useState("initials");
  const [profileError, setProfileError] = React.useState("");

  const [passwords, setPasswords] = React.useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordErrors, setPasswordErrors] = React.useState<Record<string, string>>({});

  // Seed the form once the user arrives.
  React.useEffect(() => {
    if (user) {
      setName(user.name || "");
      setAvatar(user.avatar || "initials");
    }
  }, [user]);

  const saveProfile = () => {
    const result = profileSchema.safeParse({ name, avatar });
    if (!result.success) {
      const message = result.error.issues[0]?.message || "Check your details";
      setProfileError(message);
      return;
    }
    setProfileError("");

    updateProfile.mutate(
      { name, avatar },
      {
        onSuccess: () => toast.success("Profile updated"),
        onError: (error) => toast.error("Could not save profile", { description: (error as Error).message }),
      }
    );
  };

  const savePassword = () => {
    const result = changePasswordSchema.safeParse(passwords);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (typeof key === "string" && !errors[key]) errors[key] = issue.message;
      });
      setPasswordErrors(errors);
      return;
    }
    setPasswordErrors({});

    changePassword.mutate(
      { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
      {
        onSuccess: () => {
          toast.success("Password changed", { description: "Use your new password next time you sign in." });
          setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" });
        },
        onError: (error) => {
          const message = (error as Error).message;
          setPasswordErrors({ currentPassword: message });
          toast.error("Could not change password", { description: message });
        },
      }
    );
  };

  const savePreference = (patch: Partial<Preferences>) => {
    updatePreferences.mutate(patch, {
      onError: (error) => toast.error("Could not save preference", { description: (error as Error).message }),
    });
  };

  const preferences = user?.preferences;

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <Section icon={<User className="h-4 w-4" />} title="Profile" description="How you appear in the app.">
        <div className="flex items-center gap-4">
          <Avatar name={name || user?.name} avatar={avatar} size="lg" />
          <div className="flex flex-wrap gap-2">
            {AVATAR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAvatar(option)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  avatar === option
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-sunken text-fg-muted hover:text-fg"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <Field label="Display name" error={profileError} htmlFor="settings-name">
          <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </Field>

        <Field label="Email" hint="Your email address cannot be changed here." htmlFor="settings-email">
          <Input id="settings-email" value={user?.email || ""} disabled readOnly />
        </Field>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-fg-subtle">
            {user?.lastLoginAt ? `Last signed in ${formatDateTime(user.lastLoginAt)}` : "Welcome aboard"}
          </p>
          <Button onClick={saveProfile} loading={updateProfile.isPending}>
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </Section>

      <Section
        icon={<LayoutGrid className="h-4 w-4" />}
        title="Preferences"
        description="Saved to your account, so they follow you between devices."
      >
        <div>
          <p className="mb-2 text-sm font-medium text-fg">Theme</p>
          <SegmentedControl
            value={(theme as ThemePreference) || "system"}
            onChange={(value) => {
              setTheme(value);
              savePreference({ theme: value });
            }}
            options={[
              { value: "light", label: "Light" },
              { value: "system", label: "System" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-fg">Default view</p>
          <SegmentedControl
            value={preferences?.defaultView || "list"}
            onChange={(value) => savePreference({ defaultView: value })}
            options={VIEW_OPTIONS}
          />
        </div>

        <Field label="Todos per page" htmlFor="settings-page-size">
          <NativeSelect
            id="settings-page-size"
            value={preferences?.pageSize || 10}
            onChange={(e) => savePreference({ pageSize: Number(e.target.value) })}
          >
            {[5, 10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </NativeSelect>
        </Field>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-fg">Compact cards</span>
            <span className="block text-xs text-fg-muted">Fit more todos on screen at once.</span>
          </span>
          <Switch
            checked={preferences?.density === "compact"}
            onCheckedChange={(checked) => savePreference({ density: checked ? "compact" : "comfortable" })}
            label="Compact cards"
          />
        </label>
      </Section>

      <Section icon={<KeyRound className="h-4 w-4" />} title="Change password" description="Use at least 8 characters.">
        <Field label="Current password" error={passwordErrors.currentPassword} htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={passwords.currentPassword}
            onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
            invalid={Boolean(passwordErrors.currentPassword)}
          />
        </Field>

        <Field label="New password" error={passwordErrors.newPassword} htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={passwords.newPassword}
            onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
            invalid={Boolean(passwordErrors.newPassword)}
          />
          {passwords.newPassword && <StrengthMeter password={passwords.newPassword} />}
        </Field>

        <Field label="Confirm new password" error={passwordErrors.confirmPassword} htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={passwords.confirmPassword}
            onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            invalid={Boolean(passwordErrors.confirmPassword)}
          />
        </Field>

        <div className="flex justify-end">
          <Button onClick={savePassword} loading={changePassword.isPending}>
            <ShieldCheck className="h-4 w-4" />
            Update password
          </Button>
        </div>
      </Section>
    </PageTransition>
  );
}
