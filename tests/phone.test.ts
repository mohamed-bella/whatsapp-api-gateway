import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  validatePhoneNumber,
  toWhatsAppJid,
  fromWhatsAppJid
} from '../src/whatsapp/phone';

describe('Phone Number Utilities', () => {
  it('should normalize international number with + prefix', () => {
    expect(normalizePhoneNumber('+212612345678')).toBe('212612345678');
  });

  it('should normalize number without + prefix', () => {
    expect(normalizePhoneNumber('212612345678')).toBe('212612345678');
  });

  it('should normalize number with 00 international prefix', () => {
    expect(normalizePhoneNumber('00212612345678')).toBe('212612345678');
  });

  it('should remove spaces, dashes, parentheses and dots', () => {
    expect(normalizePhoneNumber('+1 (555) 234-5678')).toBe('15552345678');
    expect(normalizePhoneNumber('+44 7911 123.456')).toBe('447911123456');
  });

  it('should strip @s.whatsapp.net if already provided', () => {
    expect(normalizePhoneNumber('212612345678@s.whatsapp.net')).toBe('212612345678');
  });

  it('should throw on invalid characters', () => {
    expect(() => normalizePhoneNumber('212612345abc')).toThrow('Invalid characters');
  });

  it('should throw on number too short or too long', () => {
    expect(() => normalizePhoneNumber('123')).toThrow('between 7 and 15 digits');
    expect(() => normalizePhoneNumber('12345678901234567')).toThrow('between 7 and 15 digits');
  });

  it('should validate phone numbers correctly', () => {
    const valid = validatePhoneNumber('+212612345678');
    expect(valid.valid).toBe(true);
    expect(valid.normalized).toBe('212612345678');
    expect(valid.jid).toBe('212612345678@s.whatsapp.net');

    const invalid = validatePhoneNumber('abc');
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toBeDefined();
  });

  it('should convert to WhatsApp JID format', () => {
    expect(toWhatsAppJid('212612345678')).toBe('212612345678@s.whatsapp.net');
    expect(toWhatsAppJid('+15552345678')).toBe('15552345678@s.whatsapp.net');
  });

  it('should extract phone number from WhatsApp JID', () => {
    expect(fromWhatsAppJid('212612345678@s.whatsapp.net')).toBe('212612345678');
    expect(fromWhatsAppJid('212612345678:1@s.whatsapp.net')).toBe('212612345678');
  });
});
