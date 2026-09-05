"use client";

import { useEffect } from "react";
import { installClientErrorCapture } from "@/lib/client-errors";

/**
 * Monterar klientfelbufferten. Renderar ingenting.
 *
 * Ligger i appens layout så att fångarna finns innan användaren hinner göra
 * något — det som redan hänt går inte att fånga i efterhand, och en kund som
 * öppnar felrapporten gör det alltid EFTER att felet inträffat.
 *
 * Bufferten lever i modulminnet och lämnar aldrig webbläsaren av sig själv:
 * den läses först när kunden själv skickar en felrapport med teknisk
 * information ikryssad.
 */
export function ClientErrorCapture() {
  useEffect(() => installClientErrorCapture(), []);
  return null;
}
