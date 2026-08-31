import type { MetadataRoute } from "next";

/** PWA-manifest: gör appen installerbar på hemskärmen (mobil & desktop) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Debet & Kredit",
    short_name: "Debet & Kredit",
    description: "Öppen bokföring för svenska småföretag",
    start_url: "/",
    display: "standalone",
    background_color: "#ea580c",
    theme_color: "#ea580c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
