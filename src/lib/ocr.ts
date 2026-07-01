/**
 * OCR-nummer enligt Bankgirocentralens standard:
 * grunddata (fakturanummer) + längdsiffra + Luhn-kontrollsiffra.
 * "Hård kontrollnivå 2" — längdsiffran är (total längd) mod 10.
 */

function luhnCheckDigit(digits: string): number {
  let sum = 0;
  let double = true; // börja dubblera från sista siffran (som föregår kontrollsiffran)
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

export function generateOcr(invoiceNo: number): string {
  const base = String(invoiceNo);
  // total längd = bas + längdsiffra + kontrollsiffra
  const lengthDigit = (base.length + 2) % 10;
  const withLength = base + String(lengthDigit);
  return withLength + String(luhnCheckDigit(withLength));
}

export function validateOcr(ocr: string): boolean {
  if (!/^\d{3,25}$/.test(ocr)) return false;
  const body = ocr.slice(0, -1);
  return luhnCheckDigit(body) === parseInt(ocr[ocr.length - 1], 10);
}
