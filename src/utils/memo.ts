/**
 * Validates a transaction memo according to MDST reference field rules:
 * - Contains only uppercase [A-Z], digits [0-9], dash [-]
 * - Groups can be multiple uppercase OR digits (not both)
 * - Dashes must separate different group types
 * - Cannot have consecutive groups of the same type
 * - Cannot start or end with a dash
 * 
 * Valid examples: "AB-00-EF", "123-CDE-789", "ABC", "123"
 * Invalid examples: "AB-CD-EF", "123-456-789", "ABC-", "-123"
 * 
 * @param memo - The memo string to validate
 * @returns true if valid, false otherwise
 */
export function isValidMemo(memo: string): boolean {
  // Empty memo is valid (will be null-terminated)
  if (!memo) return true;

  // Check for invalid characters
  if (!/^[A-Z0-9-]+$/.test(memo)) {
    return false;
  }

  // Cannot start or end with dash
  if (memo.startsWith('-') || memo.endsWith('-')) {
    return false;
  }

  // Split into groups by dash
  const groups = memo.split('-');

  // Check each group and the relationship between consecutive groups
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    
    // Empty group is invalid
    if (!group) return false;

    // Check if group is all letters or all numbers
    const isLetters = /^[A-Z]+$/.test(group);
    const isNumbers = /^[0-9]+$/.test(group);

    // Group must be either all letters or all numbers
    if (!isLetters && !isNumbers) {
      return false;
    }

    // Check consecutive groups
    if (i > 0) {
      const prevGroup = groups[i - 1];
      const prevIsLetters = /^[A-Z]+$/.test(prevGroup);
      
      // Cannot have consecutive groups of the same type
      if (isLetters === prevIsLetters) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Formats a memo string to be compatible with MDST reference field.
 * Adds null termination and pads with zeros to 16 bytes.
 * 
 * @param memo - The memo string to format
 * @returns Uint8Array of 16 bytes containing the formatted memo
 */
export function formatMemo(memo: string): Uint8Array {
  const result = new Uint8Array(16).fill(0);
  
  if (!memo || !isValidMemo(memo)) {
    return result;
  }
  
  // Convert string to bytes directly using ASCII values
  const memoBytes = Buffer.from(memo, 'ascii');
  
  // Calculate the length to copy (leaving room for null termination)
  const copyLength = Math.min(memoBytes.length, 15);
  
  // Copy memo bytes
  result.set(memoBytes.subarray(0, copyLength));
  
  // Add null termination right after the memo content
  result[copyLength] = 0;
  console.log('Result:',Buffer.from(result).toString('hex'));
  console.log('Result ascii:',Buffer.from(result).toString('ascii'));


  return result;
} 