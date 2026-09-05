import pkg from "../../package.json";

/**
 * Programmets version, läst ur package.json så den alltid följer koden.
 * Används i buggrapporter — utan versionen går en rapport från en kunds egen
 * installation inte att placera i tiden.
 *
 * Importeras bara från serverkomponenter: paketfilen ska inte följa med ut
 * i klientbundlen.
 */
export const APP_VERSION: string = pkg.version;

/**
 * Vilket bygge som körs, sju tecken ur commit-hashen.
 *
 * APP_VERSION räcker inte: den ändras bara när någon höjer package.json, och
 * har därför stått still sedan projektstart. Utan bygg-hashen går två
 * rapporter från olika veckor inte att skilja åt — och en kunds egen
 * installation går inte att placera i tiden alls.
 *
 * Ordningen: Vercels egen variabel först (finns automatiskt i deployen),
 * därefter en som självhostande kunder kan sätta i sitt bygge, sist "lokal".
 */
export const BUILD_SHA: string = (
  process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.NEXT_PUBLIC_BUILD_SHA
  || "lokal"
).slice(0, 7);
