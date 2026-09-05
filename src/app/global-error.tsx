"use client";

import { useEffect } from "react";
import { recordClientError } from "@/lib/client-errors";

/**
 * Sista skyddsnätet: fel som uppstår i rotlayouten själv, alltså innan
 * (app)/error.tsx ens finns. Den här filen ersätter hela dokumentet och
 * måste därför rendera egna html- och body-taggar — och klara sig utan
 * appens CSS, som laddas av just den layout som inte kom upp. Därav
 * inline-stilarna: de är inte slarv, de är förutsättningen.
 *
 * Felet läggs i klientfelbufferten så att det följer med om användaren
 * laddar om och skickar en felrapport.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    recordClientError({
      kind: "boundary",
      message: `Rotlayout — ${error.name}: ${error.message}`,
      source: error.digest ? `digest ${error.digest}` : "",
    });
  }, [error]);

  return (
    <html lang="sv">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#fbf9f7",
          color: "#1c1917",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            width: "100%",
            borderRadius: "1.375rem",
            background: "#fff",
            padding: "2rem",
            textAlign: "center",
            boxShadow: "0 2px 14px rgba(64, 48, 32, 0.09)",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Sidan kunde inte visas</h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#57534e" }}>
            Något avbröts innan sidan hann laddas färdigt. Dina bokförda uppgifter
            påverkas inte — de ligger kvar i databasen.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#78716c" }}>
              Felkod: {error.digest}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                borderRadius: "0.75rem",
                border: "none",
                background: "#ea580c",
                color: "#fff",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Försök igen
            </button>
            {/* Hel omladdning, inte klientnavigering: routern är en av de
                saker som kan ha fallit när den här sidan visas. */}
            <button
              type="button"
              onClick={() => { window.location.href = "/"; }}
              style={{
                borderRadius: "0.75rem",
                border: "1px solid #e7e5e4",
                background: "#fff",
                color: "#1c1917",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Till översikten
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "#78716c", marginTop: "1.25rem", marginBottom: 0 }}>
            Händer det igen går det att rapportera från menyn när sidan är uppe.
          </p>
        </main>
      </body>
    </html>
  );
}
