"use client";

/**
 * Håller server-renderad data färsk: uppdaterar vid fönsterfokus (löser
 * "gammal flik"-problemet när bokningar görs utanför appen) och var 60:e
 * sekund medan fliken är synlig.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
