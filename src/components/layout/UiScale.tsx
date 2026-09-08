"use client";

import * as React from "react";

/** Root font sizes. Everything in the UI is rem-based, so this scales all of it. */
export const UI_SCALES: Record<UiScale, { label: string; rootPx: number }> = {
  small: { label: "Small", rootPx: 14 },
  normal: { label: "Normal", rootPx: 16 },
  large: { label: "Large", rootPx: 18 },
};

/**
 * Applies the saved UI scale to <html>. It is written as a style rather than a
 * class so it never fights Tailwind, and it is cleared on unmount so the
 * signed-out pages go back to the browser default.
 */
export function UiScaleEffect({ scale }: { scale?: UiScale }) {
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${UI_SCALES[scale || "normal"].rootPx}px`;
    return () => {
      root.style.fontSize = "";
    };
  }, [scale]);

  return null;
}
