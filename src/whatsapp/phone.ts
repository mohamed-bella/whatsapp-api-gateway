/**
 * Phone number validation and WhatsApp JID transformation utilities.
 * Conforms to E.164 without '+' format for WhatsApp individual messaging.
 */

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  jid?: string;
  error?: string;
}

/**
 * Normalizes an international phone number.
 * Removes leading '+', spaces, dashes, parentheses, dots.
 * Validates international digits (typically 7 to 15 digits according to ITU-T E.164).
 */
export function normalizePhoneNumber(rawNumber: string): string {
  if (!rawNumber || typeof rawNumber !== 'string') {
    throw new Error('Phone number must be a non-empty string');
  }

  // Trim whitespace
  let cleaned = rawNumber.trim();

  // If already a JID (e.g. 212612345678@s.whatsapp.net), strip the domain for normalization
  if (cleaned.endsWith('@s.whatsapp.net') || cleaned.endsWith('@c.us')) {
    cleaned = cleaned.split('@')[0];
  }

  // Remove leading '+' or '00' international prefix if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  } else if (cleaned.startsWith('00')) {
    cleaned = cleaned.substring(2);
  }

  // Remove all non-numeric characters (spaces, dashes, parens, dots, slashes)
  cleaned = cleaned.replace(/[\s\-\(\)\.\/]/g, '');

  // Ensure only digits remain
  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`Invalid characters in phone number: "${rawNumber}"`);
  }

  // International standard E.164 numbers are between 7 and 15 digits
  if (cleaned.length < 7 || cleaned.length > 15) {
    throw new Error(
      `Phone number length must be between 7 and 15 digits (got ${cleaned.length} digits: "${cleaned}")`
    );
  }

  return cleaned;
}

/**
 * Validates a phone number and returns a structured validation result.
 */
export function validatePhoneNumber(rawNumber: string): PhoneValidationResult {
  try {
    const normalized = normalizePhoneNumber(rawNumber);
    const jid = toWhatsAppJid(normalized);
    return {
      valid: true,
      normalized,
      jid
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Invalid phone number'
    };
  }
}

/**
 * Converts a normalized phone number or raw input to a valid WhatsApp user JID.
 * WhatsApp standard JID format for individuals: <digits>@s.whatsapp.net
 */
export function toWhatsAppJid(input: string): string {
  // If already a valid JID format
  if (input.endsWith('@s.whatsapp.net')) {
    const phonePart = input.split('@')[0];
    const normalized = normalizePhoneNumber(phonePart);
    return `${normalized}@s.whatsapp.net`;
  }

  // If group JID format
  if (input.endsWith('@g.us')) {
    return input;
  }

  const normalized = normalizePhoneNumber(input);
  return `${normalized}@s.whatsapp.net`;
}

/**
 * Extracts the clean phone number from a WhatsApp JID.
 */
export function fromWhatsAppJid(jid: string): string {
  if (!jid) return '';
  const clean = jid.split('@')[0];
  // Remove device specifier if any (e.g., 212612345678:1)
  return clean.split(':')[0];
}
