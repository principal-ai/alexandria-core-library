/**
 * Simple ID generation utility
 */

/**
 * Generate a unique ID using timestamp and random string
 */
export function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${timestamp}-${random}`;
}

/**
 * ID generator with optional prefix support
 */
export const idGenerator = {
  generate(prefix?: string): string {
    const id = generateId();
    return prefix ? `${prefix}-${id}` : id;
  }
};
