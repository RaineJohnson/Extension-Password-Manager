/**
 * Pure, synchronous validation helpers shared by Login and Register.
 *
 * Kept dependency-free so they're cheap to unit-test and run on every
 * keystroke. The server's authoritative checks live in the auth schemas
 * and run on submit; these mirror just enough to give immediate feedback.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_MASTER_PASSWORD_LENGTH = 12;

export function validateEmail(value: string): string | null {
  if (value.length === 0) return 'Email is required.';
  if (!EMAIL_RE.test(value)) return 'Enter a valid email address.';
  return null;
}

export function validateMasterPassword(value: string): string | null {
  if (value.length === 0) return 'Master password is required.';
  if (value.length < MIN_MASTER_PASSWORD_LENGTH) {
    return `Master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateConfirmPassword(
  password: string,
  confirm: string,
): string | null {
  if (confirm.length === 0) return 'Please confirm your master password.';
  if (password !== confirm) return 'Master passwords do not match.';
  return null;
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

export function scorePassword(value: string): PasswordStrength {
  if (value.length < MIN_MASTER_PASSWORD_LENGTH) return 'weak';
  let classes = 0;
  if (/[a-z]/.test(value)) classes++;
  if (/[A-Z]/.test(value)) classes++;
  if (/\d/.test(value)) classes++;
  if (/[^A-Za-z0-9]/.test(value)) classes++;
  if (value.length >= 16 && classes >= 3) return 'strong';
  if (classes >= 2) return 'fair';
  return 'weak';
}
