import { describe, it, expect } from "vitest";
import {
  MASK_CLASS, MASK_CSS, SCREENSHOT_LIMITS, SKIP_CAPTURE_ATTR,
  captureScale, dataUrlBytes, isAllowedCaptureResource, splitDataUrl,
} from "@/lib/screenshot";

describe("isAllowedCaptureResource — låset mot externa anrop", () => {
  const origin = "https://kund.example.se";

  it("släpper igenom appens egna resurser", () => {
    expect(isAllowedCaptureResource("/_next/static/media/font.woff2", origin)).toBe(true);
    expect(isAllowedCaptureResource(`${origin}/icons/apple-touch-icon.png`, origin)).toBe(true);
    expect(isAllowedCaptureResource("data:image/png;base64,AAA", origin)).toBe(true);
    expect(isAllowedCaptureResource("blob:https://kund.example.se/abc", origin)).toBe(true);
  });

  it("stoppar allt utanför den egna origin", () => {
    // Skärmbilden får aldrig bli en väg för appen att prata med omvärlden.
    expect(isAllowedCaptureResource("https://fonts.gstatic.com/s/font.woff2", origin)).toBe(false);
    expect(isAllowedCaptureResource("https://abc.supabase.co/storage/v1/bild.png", origin)).toBe(false);
    expect(isAllowedCaptureResource("//cdn.example.com/x.png", origin)).toBe(false);
    expect(isAllowedCaptureResource("", origin)).toBe(false);
  });
});

describe("captureScale", () => {
  it("kapar bredden vid 1400 px", () => {
    expect(captureScale(1512)).toBeCloseTo(1400 / 1512);
    expect(captureScale(390)).toBe(1);
    expect(captureScale(3840)).toBeCloseTo(1400 / 3840);
  });

  it("skalar aldrig upp och kraschar inte på skräpvärden", () => {
    expect(captureScale(800)).toBe(1);
    expect(captureScale(0)).toBe(1);
    expect(captureScale(Number.NaN)).toBe(1);
  });
});

describe("dataUrlBytes och splitDataUrl", () => {
  it("räknar base64 till byte", () => {
    // "hej" -> aGVq (4 tecken, ingen utfyllnad)
    expect(dataUrlBytes("data:image/jpeg;base64,aGVq")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,aGU=")).toBe(2);
    expect(dataUrlBytes("data:image/jpeg;base64,aA==")).toBe(1);
    expect(dataUrlBytes("inte en data-url")).toBe(0);
  });

  it("delar upp i mime-typ och ren base64 — formen endpointen tar emot", () => {
    expect(splitDataUrl("data:image/jpeg;base64,aGVq")).toEqual({ mimeType: "image/jpeg", data: "aGVq" });
    expect(splitDataUrl("data:image/png;base64,AAAA")).toEqual({ mimeType: "image/png", data: "AAAA" });
    expect(splitDataUrl("https://example.com/bild.png")).toBeNull();
  });
});

describe("maskering och undantag", () => {
  it("suddar sifferkolumner och det som märkts känsligt", () => {
    expect(MASK_CSS).toContain("[data-sensitive]");
    expect(MASK_CSS).toContain(".tabular-nums");
    expect(MASK_CSS).toContain("blur(5px)");
    expect(MASK_CSS).toContain(MASK_CLASS);
  });

  it("har ett attribut för det som aldrig ska med i bilden", () => {
    expect(SKIP_CAPTURE_ATTR).toBe("data-skip-capture");
  });

  it("håller bilden inom det endpointen tar emot", () => {
    expect(SCREENSHOT_LIMITS.maxBytes).toBeLessThanOrEqual(1_500_000);
    expect(SCREENSHOT_LIMITS.mimeType).toBe("image/jpeg");
  });
});
