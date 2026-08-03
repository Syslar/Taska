/**
 * formatNigerianPhone — Normalises a Nigerian phone number to international format
 * for use with Termii / any SMS provider.
 *
 * Accepted inputs:
 *   "08012345678"    → "2348012345678"
 *   "2348012345678"  → "2348012345678"
 *   "+2348012345678" → "2348012345678"
 *   "8012345678"     → "2348012345678"
 */
export function formatNigerianPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, ''); // strip non-digits

  if (cleaned.startsWith('234')) {
    return cleaned; // already in international format
  }

  if (cleaned.startsWith('0')) {
    return '234' + cleaned.slice(1); // 0XXXXXXXXXX → 234XXXXXXXXXX
  }

  return '234' + cleaned; // bare 10-digit → prepend country code
}
