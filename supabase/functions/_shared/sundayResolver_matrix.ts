// Shared input/output matrix for the Sunday resolver tests. Imported by
// BOTH the Deno test (sundayResolver_test.ts) and the Vitest test
// (src/lib/skills/__tests__/sundayResolver.test.ts) so drift between the
// two implementations is caught structurally.
export const MATRIX = [
  ["Domingo 03-may 11:00 CEST",   "2026-05-03T09:00:00Z", "2026-05-03", false],
  ["Domingo 03-may 10:59 CEST",   "2026-05-03T08:59:00Z", "2026-04-26", true ],
  ["Domingo 03-may 13:00 CEST",   "2026-05-03T11:00:00Z", "2026-05-03", false],
  ["Lunes 04-may 09:00 CEST",     "2026-05-04T07:00:00Z", "2026-05-03", false],
  ["Miércoles 06-may 12:00 CEST", "2026-05-06T10:00:00Z", "2026-05-03", false],
  ["Sábado 09-may 23:59 CEST",    "2026-05-09T21:59:00Z", "2026-05-03", false],
  ["Domingo 31-may 22:00 UTC",    "2026-05-31T22:00:00Z", "2026-05-31", false],
  ["Viernes 31-dic 22:00 UTC",    "2026-12-31T22:00:00Z", "2026-12-27", false],
] as const;