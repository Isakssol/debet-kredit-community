import { describe, it, expect } from "vitest";
import { fileNameFrom } from "@/lib/download";

describe("fileNameFrom", () => {
  it("läser ett citerat filnamn", () => {
    expect(fileNameFrom('attachment; filename="arkiv-2026.zip"')).toBe("arkiv-2026.zip");
  });

  it("läser ett ociterat filnamn", () => {
    expect(fileNameFrom("attachment; filename=sie-2026.se")).toBe("sie-2026.se");
  });

  it("föredrar den UTF-8-kodade formen — svenska filnamn ska överleva", () => {
    const header = "attachment; filename=\"arsredovisning.pdf\"; "
      + "filename*=UTF-8''%C3%A5rsredovisning-2026.pdf";
    expect(fileNameFrom(header)).toBe("årsredovisning-2026.pdf");
  });

  it("faller tillbaka på filename när procentkodningen är trasig", () => {
    const header = "attachment; filename=\"reserv.pdf\"; filename*=UTF-8''%E0%A4%A";
    expect(fileNameFrom(header)).toBe("reserv.pdf");
  });

  it("svarar null när huvudet saknas eller är tomt", () => {
    expect(fileNameFrom(null)).toBeNull();
    expect(fileNameFrom(undefined)).toBeNull();
    expect(fileNameFrom("inline")).toBeNull();
  });

  it("svarar null när filename saknar värde", () => {
    expect(fileNameFrom('attachment; filename=""')).toBeNull();
  });
});
