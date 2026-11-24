/** Basic mailbox validation shared by profile binding and email-code login. */
export function isValidEmailAddress(value: string): boolean {
  const address = value.trim();
  return /^[^\s@]+@[^\s@]+$/.test(address) && /@[^@]+\.[^@.]+$/.test(address);
}
