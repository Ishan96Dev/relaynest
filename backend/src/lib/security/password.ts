const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "password@123",
  "password123!",
  "qwerty123",
  "qwerty@123",
  "12345678",
  "123456789",
  "admin@123",
  "admin123",
  "welcome123",
  "welcome@123",
  "letmein123",
  "iloveyou",
  "changeme",
  "relaynest123",
]);

export interface PasswordAssessment {
  score: 0 | 1 | 2 | 3;
  label: string;
  isAcceptable: boolean;
  reason?: string;
}

/**
 * Evaluates password strength across length, character classes, and common breached/phishable patterns.
 */
export function assessPasswordStrength(password: string): PasswordAssessment {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    return { score: 0, label: "Too short", isAcceptable: false, reason: "Use at least 8 characters." };
  }
  if (COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase())) {
    return { score: 0, label: "Common password", isAcceptable: false, reason: "Avoid commonly guessed or breached passwords." };
  }
  if (/^(.)\1+$/.test(trimmed) || /^(012345|123456|abcdef|qwerty)/i.test(trimmed)) {
    return { score: 1, label: "Predictable pattern", isAcceptable: false, reason: "Avoid sequential or repeated characters." };
  }

  let s = 1;
  if (/[A-Z]/.test(trimmed) && /[a-z]/.test(trimmed)) s++;
  if (/\d/.test(trimmed) && /[^A-Za-z0-9]/.test(trimmed)) s++;
  if (trimmed.length >= 12 && s === 3) {
    return { score: 3, label: "Very strong", isAcceptable: true };
  }
  const labels = ["Too weak", "Weak", "Good", "Strong password"] as const;
  return {
    score: s as 0 | 1 | 2 | 3,
    label: labels[s]!,
    isAcceptable: s >= 2,
    reason: s < 2 ? "Mix uppercase, lowercase, numbers, and a symbol." : undefined,
  };
}
