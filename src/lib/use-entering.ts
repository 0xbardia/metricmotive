import { useEffect, useState } from "react";

/**
 * True after mount (after hydration on first load). Put `enter-on` on a container when it is true, and `rise`
 * (with optional `d1` to `d3` delays) on the items that move: the entrance then starts after hydration and the
 * server markup is fully visible at rest. Transform only; off under reduced motion (styles.css).
 */
export function useEntering(): boolean {
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    setEntering(true);
  }, []);
  return entering;
}
