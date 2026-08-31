/** Ladda ner AGI-XML för en lönekörningsperiod: /lon/agi?period=ÅÅÅÅMM */
import { createClient } from "@/lib/supabase/server";
import { buildAgiXml } from "@/lib/payroll/agi";

export async function GET(req: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const period = new URL(req.url).searchParams.get("period") ?? "";
  const [{ data: run }, { data: settings }] = await Promise.all([
    supabase.from("payroll_runs").select("*").eq("period", period).single(),
    supabase.from("settings").select("company_name, org_number, email, phone").eq("id", 1).single(),
  ]);
  if (!run) return new Response("Ingen lönekörning för perioden.", { status: 404 });
  if (!settings?.org_number) {
    return new Response("Ange organisationsnummer under Inställningar först.", { status: 400 });
  }

  try {
    const xml = buildAgiXml({
      orgNumber: settings.org_number,
      period,
      programName: "Debet & Kredit",
      contact: {
        name: settings.company_name ?? "Kontaktperson",
        phone: settings.phone || "0000000000",
        email: settings.email || "info@example.se",
      },
      employee: {
        personalNumber: run.employee_personal_number,
        grossSalary: Number(run.gross_salary),
        taxDeduction: Number(run.tax_deduction),
      },
      employerFee: Number(run.employer_fee),
      workplace: { address: run.workplace_address ?? undefined, city: run.workplace_city ?? undefined },
    });
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="agi-${period}.xml"`,
      },
    });
  } catch (e) {
    return new Response((e as Error).message, { status: 400 });
  }
}
