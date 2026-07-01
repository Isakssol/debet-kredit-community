import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import iconv from "iconv-lite";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  if (!period) return NextResponse.json({ error: "period saknas" }, { status: 400 });

  const supabase = await createClient();
  const { data: report } = await supabase.from("vat_reports")
    .select("eskd_xml, period_start, period_end")
    .eq("period_start", period).single();
  if (!report?.eskd_xml) {
    return NextResponse.json({ error: "Ingen godkänd rapport för perioden." }, { status: 404 });
  }

  // Skatteverket kräver ISO-8859-1
  const encoded = iconv.encode(report.eskd_xml, "iso-8859-1");
  return new NextResponse(new Uint8Array(encoded), {
    headers: {
      "Content-Type": "application/xml; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="momsdeklaration-${report.period_end.slice(0, 7)}.xml"`,
    },
  });
}
