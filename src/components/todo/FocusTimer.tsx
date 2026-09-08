"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Bell, BellOff, Coffee, Pause, Play, RotateCcw, Target } from "lucide-react";
import { Button, Card, CardContent, IconButton, SegmentedControl, Tooltip, useToast } from "@/components/ui";
import { formatClock, usePomodoro, useNotifications } from "@/hooks/useProductivity";
import { cn } from "@/lib/utils";

/**
 * Pomodoro timer with a circular progress dial. Fires a toast and, if the user
 * has granted permission, a browser notification when a phase ends.
 */
export function FocusTimer({ compact }: { compact?: boolean }) {
  const toast = useToast();
  const { permission, request, notify } = useNotifications();

  const { phase, running, secondsLeft, progress, completed, start, pause, reset, switchPhase } =
    usePomodoro((finished) => {
      const message =
        finished === "focus" ? "Focus session complete — take a break." : "Break over — back to it.";
      toast.success(finished === "focus" ? "Session complete" : "Break finished", { description: message });
      notify(finished === "focus" ? "Focus session complete" : "Break finished", { body: message });
    });

  const size = compact ? 96 : 148;
  const stroke = compact ? 6 : 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between gap-2">
          <SegmentedControl
            value={phase}
            onChange={(value) => switchPhase(value)}
            options={[
              { value: "focus" as const, label: "Focus", icon: <Target className="h-3.5 w-3.5" /> },
              { value: "break" as const, label: "Break", icon: <Coffee className="h-3.5 w-3.5" /> },
            ]}
          />

          {permission !== "unsupported" && (
            <Tooltip content={permission === "granted" ? "Notifications on" : "Enable notifications"}>
              <IconButton
                label="Notifications"
                onClick={async () => {
                  if (permission === "granted") return;
                  const result = await request();
                  if (result === "granted") toast.success("Notifications enabled");
                  else if (result === "denied") toast.error("Notifications blocked by the browser");
                }}
              >
                {permission === "granted" ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              </IconButton>
            </Tooltip>
          )}
        </div>

        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className="stroke-surface-sunken"
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              className={cn(phase === "focus" ? "stroke-primary" : "stroke-success")}
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: circumference - (progress / 100) * circumference }}
              transition={{ type: "tween", duration: 0.4 }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("font-semibold tabular-nums text-fg", compact ? "text-xl" : "text-3xl")}>
              {formatClock(secondsLeft)}
            </span>
            {!compact && (
              <span className="text-xs text-fg-subtle">{phase === "focus" ? "focus" : "break"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant={running ? "secondary" : "primary"} onClick={running ? pause : start}>
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {running ? "Pause" : "Start"}
          </Button>
          <IconButton label="Reset" variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
        </div>

        <p className="text-xs text-fg-subtle">
          {completed} focus session{completed === 1 ? "" : "s"} completed
        </p>
      </CardContent>
    </Card>
  );
}
