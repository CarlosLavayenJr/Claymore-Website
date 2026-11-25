// Member names. Google and Apple don't always send a full name (some Google profiles are a first
// name only), so the site asks for first and last name and the API stores "First Last".

export const MAX_NAME_LENGTH = 80

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

/** True when there's no name, or only one word (no last name). */
export function needsFullName(name: string | null | undefined): boolean {
    const n = clean(name)
    return n.length === 0 || !n.includes(' ') || n.includes('@')
}

/** "Anthony Rossi" → first "Anthony", last "Rossi"; everything after the first word is the last name. */
export function splitName(name: string | null | undefined): { first: string; last: string } {
    const n = clean(name)
    if (!n || n.includes('@')) return { first: '', last: '' }
    const i = n.indexOf(' ')
    return i < 0 ? { first: n, last: '' } : { first: n.slice(0, i), last: n.slice(i + 1) }
}

export type NameParse = { ok: true; name: string } | { ok: false; message: string }

/** Both parts required; joined as "First Last", at most 80 characters. */
export function parseNameForm(formData: FormData): NameParse {
    const first = clean(formData.get('first'))
    const last = clean(formData.get('last'))
    if (!first || !last) return { ok: false, message: 'Enter both a first and a last name.' }
    const name = `${first} ${last}`
    if (name.length > MAX_NAME_LENGTH) return { ok: false, message: `Keep the name to ${MAX_NAME_LENGTH} characters.` }
    return { ok: true, name }
}
