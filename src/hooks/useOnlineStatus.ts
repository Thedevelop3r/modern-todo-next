"use client";

import * as React from "react";

/**
 * Whether the browser thinks it has a connection. `navigator.onLine` is only a
 * hint (a captive portal still reports true), so the banner it drives says
 * "you appear to be offline" rather than asserting it.
 *
 * Starts as `true` on the server and on the first client render, so the markup
 * matches and nothing flashes during hydration.
 */
export function useOnlineStatus() {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
