import { NextResponse } from "next/server";
import { buildSieForYear } from "@/lib/sie/build";
import iconv from "iconv-lite";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const year = parseInt(url.searchParams.get("year") ?? "");
  if (!year) return NextResponse.json({ error: "year saknas" }, { status: 400 });

  const result = await buildSieForYear(year);
  if ("error" in result) return NextResponse.json(result, { status: 400 });

  // SIE-standarden kräver PC8 (IBM CP437)
  const encoded = iconv.encode(result.sie, "cp437");
  return new NextResponse(new Uint8Array(encoded), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="trimtech-${year}.se"`,
    },
  });
}
