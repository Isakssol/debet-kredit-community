import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Inställningssidan länkas till med ankare från hela programmet: skattekalendern
 * pekar på #f-skatt, attest-notiserna på #attest, ändringsloggen på
 * #sakerhetskopia och #byra, onboardingen på #sie-import. Ett ankare som
 * försvinner vid en omgruppering ger ingen felkod — länken landar bara högst upp
 * på en sida med arton kort, och ingen märker det förrän en användare hör av sig.
 *
 * Testet läser källkoden i stället för att rendera: målet är att ingen ska kunna
 * flytta ett kort utan att ta med sig dess id.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const sources = files.map((f) => readFileSync(f, "utf8"));
const allSource = sources.join("\n");

/** Ankare som annan kod faktiskt länkar till: /installningar#… */
const referenced = [...new Set(
  [...allSource.matchAll(/\/installningar#([a-z0-9-]+)/g)].map((m) => m[1]),
)];

/** Alla id-attribut som finns i källkoden */
const declared = new Set(
  [...allSource.matchAll(/\bid=["']([a-z0-9-]+)["']/g)].map((m) => m[1]),
);

describe("ankare på Inställningar", () => {
  it("hittar länkarna att kontrollera", () => {
    // Sanity: går regexen sönder ska testet falla här, inte tyst godkänna allt.
    // Tröskeln är låg med flit — filen är densamma i båda repona och de har
    // olika många ankare.
    expect(referenced.length).toBeGreaterThanOrEqual(3);
    expect(referenced).toContain("f-skatt");
  });

  it.each(referenced)("#%s finns som id någonstans i gränssnittet", (anchor) => {
    expect(declared.has(anchor)).toBe(true);
  });

  it("varje avsnitt i innehållsförteckningen har ett eget id", () => {
    const page = readFileSync(join(SRC, "app/(app)/installningar/page.tsx"), "utf8");
    const groups = [...page.matchAll(/\{ id: "([a-z-]+)", title: "/g)].map((m) => m[1]);
    expect(groups.length).toBeGreaterThanOrEqual(3);
    for (const id of groups) {
      // Rubriken renderas med <SettingsSection id="…">
      expect(page).toContain(`id="${id}"`);
    }
  });
});
