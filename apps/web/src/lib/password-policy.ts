export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordRequirements = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { label: "One lowercase letter", test: (value: string) => /[a-z]/.test(value) },
  { label: "One uppercase letter", test: (value: string) => /[A-Z]/.test(value) },
  { label: "One number", test: (value: string) => /[0-9]/.test(value) },
  { label: "One symbol", test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
] as const;

export function passwordPolicyError(password: string): string | null {
  const unmet = passwordRequirements.filter((requirement) => !requirement.test(password));
  if (unmet.length > 0) {
    return `Password must include ${unmet.map((requirement) => requirement.label.toLowerCase()).join(", ")}.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must not exceed ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
