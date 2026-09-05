import { describe, it, expect } from "vitest";
import {
  LOGO_MAX_BYTES, isPdfEmbeddableLogo, validateLogo, type LogoFileInfo,
} from "@/lib/branding/logo";

const file = (over: Partial<LogoFileInfo> = {}): LogoFileInfo => ({
  name: "logotyp.png", size: 12_345, type: "image/png", ...over,
});

describe("validateLogo", () => {
  it("släpper igenom PNG, JPG och SVG", () => {
    expect(validateLogo(file())).toBeNull();
    expect(validateLogo(file({ name: "logo.jpg", type: "image/jpeg" }))).toBeNull();
    expect(validateLogo(file({ name: "logo.svg", type: "image/svg+xml" }))).toBeNull();
  });

  it("stoppar filer över 1 MB", () => {
    expect(validateLogo(file({ size: LOGO_MAX_BYTES + 1 }))).toBe("Logotypen är för stor (max 1 MB).");
    expect(validateLogo(file({ size: LOGO_MAX_BYTES }))).toBeNull();
  });

  it("stoppar tomma filer och avsaknad av fil", () => {
    expect(validateLogo(file({ size: 0 }))).toBe("Filen är tom.");
    expect(validateLogo(null)).toBe("Filen är tom.");
    expect(validateLogo(undefined)).toBe("Filen är tom.");
  });

  it("stoppar andra filtyper", () => {
    expect(validateLogo(file({ name: "logo.gif", type: "image/gif" })))
      .toBe("Logotypen måste vara PNG, JPG eller SVG.");
    expect(validateLogo(file({ name: "arsredovisning.pdf", type: "application/pdf" })))
      .toBe("Logotypen måste vara PNG, JPG eller SVG.");
  });

  it("litar på filändelsen när webbläsaren inte satt någon MIME-typ", () => {
    expect(validateLogo(file({ name: "LOGO.SVG", type: "" }))).toBeNull();
    expect(validateLogo(file({ name: "logo.tiff", type: "" })))
      .toBe("Okänd filtyp. Spara logotypen som PNG, JPG eller SVG.");
  });

  it("accepterar rätt ändelse även när MIME-typen är generisk", () => {
    expect(validateLogo(file({ name: "logo.png", type: "application/octet-stream" }))).toBeNull();
  });
});

describe("isPdfEmbeddableLogo", () => {
  it("bara raster går att bädda in i faktura-PDF:en", () => {
    expect(isPdfEmbeddableLogo("logo/1-logotyp.png")).toBe(true);
    expect(isPdfEmbeddableLogo("logo/1-logotyp.JPG")).toBe(true);
    expect(isPdfEmbeddableLogo("logo/1-logotyp.svg")).toBe(false);
    expect(isPdfEmbeddableLogo(null)).toBe(false);
    expect(isPdfEmbeddableLogo("")).toBe(false);
  });
});
