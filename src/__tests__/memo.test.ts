import { isValidMemo, formatMemo } from '../utils/memo';
import { describe, expect, it } from '@jest/globals';

describe('Memo Validation', () => {
  describe('isValidMemo', () => {
    it('should validate empty memo', () => {
      expect(isValidMemo('')).toBe(true);
    });

    it('should validate simple letter groups', () => {
      expect(isValidMemo('ABC')).toBe(true);
      expect(isValidMemo('ABCD')).toBe(true);
    });
    it('should validate letter groups with numbers', () => {
      expect(isValidMemo('THEQUICK')).toBe(true);
      expect(isValidMemo('BROWN-123-FOX')).toBe(true);
    });

    it('should validate simple number groups', () => {
      expect(isValidMemo('123')).toBe(true);
      expect(isValidMemo('1234')).toBe(true);
    });

    it('should validate alternating letter and number groups', () => {
      expect(isValidMemo('AB-12-CD')).toBe(true);
      expect(isValidMemo('123-ABC-456')).toBe(true);
      expect(isValidMemo('AB-00-EF')).toBe(true);
    });

    it('should reject invalid characters', () => {
      expect(isValidMemo('ab-12')).toBe(false);
      expect(isValidMemo('AB_12')).toBe(false);
      expect(isValidMemo('AB 12')).toBe(false);
    });

    it('should reject consecutive same-type groups', () => {
      expect(isValidMemo('AB-CD-EF')).toBe(false);
      expect(isValidMemo('123-456-789')).toBe(false);
    });

    it('should reject memos starting or ending with dash', () => {
      expect(isValidMemo('-AB-12')).toBe(false);
      expect(isValidMemo('AB-12-')).toBe(false);
    });

    it('should reject empty groups', () => {
      expect(isValidMemo('AB--12')).toBe(false);
      expect(isValidMemo('AB-12-')).toBe(false);
    });
  });

  describe('formatMemo', () => {
    it('should format valid memo with null termination', () => {
      const memo = 'AB-12-CD';
      const result = formatMemo(memo);
      
      // Debug logging
      console.log('Memo length:', memo.length);
      console.log('Result array:', Array.from(result).map(b => b.toString()));
      console.log('ASCII values:', memo.split('').map(c => c.charCodeAt(0)));
      
      expect(result.length).toBe(16);
      expect(result[8]).toBe(0); // Null termination after 'AB-12-CD' (8 chars)
      expect(result.slice(9)).toEqual(new Uint8Array(7).fill(0)); // Remaining bytes are zero
    });

    it('should handle empty memo', () => {
      const result = formatMemo('');
      expect(result).toEqual(new Uint8Array(16).fill(0));
    });

    it('should handle invalid memo', () => {
      const result = formatMemo('invalid-memo');
      expect(result).toEqual(new Uint8Array(16).fill(0));
    });

    it('should truncate long memos', () => {
      const result = formatMemo('AB-12-CD-34-EF-56');
      expect(result.length).toBe(16);
      // Should include first 15 bytes + null termination
      expect(Buffer.from(result.slice(0, 15)).toString()).toBe('AB-12-CD-34-EF-');
      expect(result[15]).toBe(0);
    });
  });
}); 