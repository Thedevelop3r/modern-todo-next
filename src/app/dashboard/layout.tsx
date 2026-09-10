"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { UiScaleEffect } from "@/components/layout/UiScale";
import { FontEffect, ThemeEffect } from "@/components/layout/ThemeVars";
import { CommandPalette } from "@/components/command/CommandPalette";
import { ShortcutsModal } from "@/components/command/ShortcutsModal";
import { useKeyboardShortcuts } from "@/hooks/useKeyboard";
import { useMe } from "@/hooks/useAuth";
import { useUiStore } from "@/store/state";
import { Spinner } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useMe();
  const setView = useUiStore((s) => s.setView);

  useKeyboardShortcuts();

  // The cookie is the only credential; a failed /me means it is gone.
  React.useEffect(() => {
    if (isError) router.replace("/login");
  }, [isError, router]);

  // Apply the saved default view once the user is known.
  React.useEffect(() => {
    if (user?.preferences?.defaultView) setView(user.preferences.defaultView);
  }, [user?.preferences?.defaultView, setView]);

  if (isLoading || isError || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <OfflineBanner />
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
      <CommandPalette />
      <ShortcutsModal />
      <UiScaleEffect scale={user.preferences?.uiScale} />
      <ThemeEffect themeId={user.preferences?.themeId} theme={user.preferences?.theme} />
      <FontEffect fontFamily={user.preferences?.fontFamily} />
    </div>
  );
}
