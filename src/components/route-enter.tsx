import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Route wrapper. Its entrance is added after mount, so on first load it starts after hydration, and the server
 * markup (and a page without JS) is fully visible at rest: the default state has no animation at all. Keyed by
 * the route in the root, so every navigation mounts a new wrapper and enters again.
 */
export function RouteEnter({ children }: { children: ReactNode }) {
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    setEntering(true);
  }, []);
  return <div className={cn("route-enter", entering && "route-enter-on")}>{children}</div>;
}
