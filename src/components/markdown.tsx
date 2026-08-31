import React from "react";

/**
 * Minimal, säker markdown-rendering för AI-svar: rubriker, fet/kursiv stil,
 * inline-kod, punkt-/nummerlistor och tabeller. Bygger React-element —
 * ingen innerHTML, så innehållet kan aldrig köra som HTML.
 */

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // **fet**, *kursiv*, `kod`
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let last = 0, i = 0;
  for (const match of text.matchAll(regex)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={`${keyPrefix}-b${i}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={`${keyPrefix}-c${i}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<em key={`${keyPrefix}-i${i}`}>{token.slice(1, -1)}</em>);
    }
    last = match.index! + token.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
const isDivider = (l: string) => /^\s*\|[\s\-:|]+\|\s*$/.test(l);

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // Rubriker
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <div key={key++} className="font-semibold text-[0.95em] mt-1">
          {renderInline(heading[2], `h${key}`)}
        </div>
      );
      i++; continue;
    }

    // Tabeller
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const headers = line.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={key++} className="overflow-x-auto">
          <table className="text-[0.92em] w-full my-1">
            <thead>
              <tr className="border-b border-border/70 text-left">
                {headers.map((h, j) => (
                  <th key={j} className="py-1 pr-3 font-medium">{renderInline(h, `th${key}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-border/40 last:border-0">
                  {row.map((c, j) => (
                    <td key={j} className="py-1 pr-3 align-top">{renderInline(c, `td${key}-${r}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Listor (punkt + nummer)
    const bullet = /^\s*[-•–]\s+/;
    const numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const items: string[] = [];
      while (i < lines.length && (bullet.test(lines[i]) || numbered.test(lines[i]))) {
        items.push(lines[i].replace(bullet, "").replace(numbered, ""));
        i++;
      }
      const cls = "my-1 space-y-1 pl-5 " + (ordered ? "list-decimal" : "list-disc");
      blocks.push(
        ordered
          ? <ol key={key++} className={cls}>{items.map((it, j) => <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>)}</ol>
          : <ul key={key++} className={cls}>{items.map((it, j) => <li key={j}>{renderInline(it, `li${key}-${j}`)}</li>)}</ul>
      );
      continue;
    }

    // Stycke — slå ihop följande rader tills blankrad/blockstart
    const para: string[] = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() !== "" && !lines[i].match(/^#{1,4}\s/) &&
      !bullet.test(lines[i]) && !numbered.test(lines[i]) && !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++} className="my-1 leading-relaxed">{renderInline(para.join(" "), `p${key}`)}</p>);
  }

  return <div className="space-y-1.5">{blocks}</div>;
}
