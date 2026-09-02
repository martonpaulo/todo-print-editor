const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The single owner of the document date invariant: exactly `YYYY-MM-DD`, and a day that exists in
 * the proleptic Gregorian calendar. Every input boundary — Markdown parsing and persisted-document
 * decoding — asks this function, so the two can never accept different sets of dates.
 *
 * The calendar check round-trips through `Date`'s ISO parser rather than `Date.UTC`, because
 * `Date.UTC` maps a two-digit year onto 1900 and would reject `0050-03-01` as a mismatch. Both
 * agree for every year from 0100 onwards; only the round-trip is correct below it.
 */
export const isValidIsoDate = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
