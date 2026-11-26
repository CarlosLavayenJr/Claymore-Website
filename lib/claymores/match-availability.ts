// Pure helpers for match availability and lineups (member account and Club Admin).
// No `server-only` import so they can be unit tested.

import type { AvailabilityCounts, AvailabilityStatus, Lineup, MemberAvailability, SaveLineupInput } from './api-client'

export const AVAILABILITY_CHOICES: readonly { status: AvailabilityStatus; label: string }[] = [
    { status: 'available', label: 'Available' },
    { status: 'maybe', label: 'Maybe' },
    { status: 'unavailable', label: 'Out' },
]

/** The API's note limit. */
export const MAX_AVAILABILITY_NOTE = 200

export function isAvailabilityStatus(value: unknown): value is AvailabilityStatus {
    return value === 'available' || value === 'maybe' || value === 'unavailable'
}

export function availabilityLabel(status: AvailabilityStatus | string | null | undefined): string {
    return AVAILABILITY_CHOICES.find(c => c.status === status)?.label ?? 'No reply'
}

/** "14 available · 3 maybe · 2 out · 10 no reply" (zero groups left out, except when everything is zero). */
export function countsLine(counts: AvailabilityCounts): string {
    const parts = [
        counts.available && `${counts.available} available`,
        counts.maybe && `${counts.maybe} maybe`,
        counts.unavailable && `${counts.unavailable} out`,
        counts.noReply && `${counts.noReply} no reply`,
    ].filter(Boolean)
    return parts.length ? parts.join(' · ') : 'No answers yet'
}

// --- Matches ---

/** Today's date (YYYY-MM-DD) in Orlando, which is when the API closes answers. */
export function todayInOrlando(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now)
}

type MatchLike = { _id: string; date: string; homeTeam: string; awayTeam: string; status: string }

/**
 * The next Claymores matches members can answer for: upcoming, from today on, sorted by date.
 * Club events (the Highland Games, listed as Claymores vs Claymores) count: the club plays there.
 */
export function upcomingMatches<T extends MatchLike>(matches: readonly T[], today: string, limit = 6): T[] {
    return matches
        .filter(m => m.status === 'upcoming' && m.date.slice(0, 10) >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, limit)
}

/** "Sat, Jan 23" for a YYYY-MM-DD match date. */
export function shortMatchDate(date: string): string {
    const d = new Date(`${date.slice(0, 10)}T12:00:00Z`)
    if (Number.isNaN(d.getTime())) return date
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// --- Members ---

export function memberName(member: { name: string | null; email: string }): string {
    return member.name?.trim() || member.email
}

export type PickerGroup = { key: 'available' | 'maybe' | 'noReply' | 'unavailable'; label: string; members: MemberAvailability[] }

const GROUPS: readonly { key: PickerGroup['key']; label: string; status: AvailabilityStatus | null }[] = [
    { key: 'available', label: 'Available', status: 'available' },
    { key: 'maybe', label: 'Maybe', status: 'maybe' },
    { key: 'noReply', label: 'No reply', status: null },
    { key: 'unavailable', label: 'Out', status: 'unavailable' },
]

/**
 * Members grouped for the lineup picker and the availability breakdown: Available, Maybe,
 * No reply, Out, each sorted by name. Unknown statuses count as no reply. Empty groups are kept
 * (the breakdown shows "None"); the picker skips them.
 */
export function groupMembers(members: readonly MemberAvailability[]): PickerGroup[] {
    const sorted = [...members].sort((a, b) => memberName(a).localeCompare(memberName(b), 'en', { sensitivity: 'base' }))
    return GROUPS.map(g => ({
        key: g.key,
        label: g.label,
        members: sorted.filter(m => (isAvailabilityStatus(m.status) ? m.status : null) === g.status),
    }))
}

// --- Lineups ---

export const LINEUP_SIZE = 23
export const STARTERS = 15

const POSITIONS = [
    'Loosehead prop', 'Hooker', 'Tighthead prop', 'Lock', 'Lock', 'Blindside flanker', 'Openside flanker',
    'Number 8', 'Scrum-half', 'Fly-half', 'Left wing', 'Inside centre', 'Outside centre', 'Right wing', 'Fullback',
] as const

/** Same labels as the API (MatchAvailability.Positions). */
export function positionOf(number: number): string {
    return number >= 1 && number <= STARTERS ? POSITIONS[number - 1] : 'Replacement'
}

export const LINEUP_NUMBERS: readonly number[] = Array.from({ length: LINEUP_SIZE }, (_, i) => i + 1)

/** Number -> member subject, as the editor's selects hold them ("" for an empty number). */
export type LineupValues = Record<number, string>

export function lineupValues(lineup: Pick<Lineup, 'slots'> | null | undefined): LineupValues {
    const values: LineupValues = {}
    for (const n of LINEUP_NUMBERS) values[n] = ''
    for (const slot of lineup?.slots ?? []) if (slot.number >= 1 && slot.number <= LINEUP_SIZE) values[slot.number] = slot.subject
    return values
}

type FormLike = Pick<FormData, 'get'>
const text = (form: FormLike, key: string) => String(form.get(key) ?? '').trim()

/** Fixture ids are Sanity document ids; anything else is a tampered form. */
export function isFixtureId(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value)
}

export type ParsedLineup =
    | { ok: true; fixtureId: string; input: SaveLineupInput; values: LineupValues }
    | { ok: false; fixtureId: string | null; message: string; values: LineupValues }

/**
 * Reads the lineup editor: `fixtureId`, `slot-1` … `slot-23` (member subject or empty) and
 * `intent` ("publish" or "draft"). Empty numbers are left out, like the API does.
 */
export function parseLineupForm(form: FormLike): ParsedLineup {
    const values: LineupValues = {}
    for (const n of LINEUP_NUMBERS) values[n] = text(form, `slot-${n}`).slice(0, 200)
    const fixtureId = text(form, 'fixtureId')
    if (!isFixtureId(fixtureId)) {
        return { ok: false, fixtureId: null, message: 'The form expired. Refresh the page and try again.', values }
    }

    const seen = new Map<string, number>()
    for (const n of LINEUP_NUMBERS) {
        const subject = values[n]
        if (!subject) continue
        const first = seen.get(subject)
        if (first !== undefined) {
            return { ok: false, fixtureId, message: `The same player is picked for ${first} and ${n}. Each player can be in the lineup once.`, values }
        }
        seen.set(subject, n)
    }

    const slots = LINEUP_NUMBERS.filter(n => values[n]).map(n => ({ number: n, subject: values[n] }))
    return { ok: true, fixtureId, input: { slots, publish: text(form, 'intent') === 'publish' }, values }
}

export type ParsedAnswer =
    | { ok: true; fixtureId: string; status: AvailabilityStatus; note: string | null }
    | { ok: false; fixtureId: string | null }

/** Reads the member's answer form: `fixtureId`, `status` (the button pressed) and an optional `note`. */
export function parseAvailabilityForm(form: FormLike): ParsedAnswer {
    const fixtureId = text(form, 'fixtureId')
    const status = text(form, 'status')
    const note = text(form, 'note')
    if (!isFixtureId(fixtureId)) return { ok: false, fixtureId: null }
    if (!isAvailabilityStatus(status) || note.length > MAX_AVAILABILITY_NOTE) return { ok: false, fixtureId }
    return { ok: true, fixtureId, status, note: note || null }
}

/** DOM id for a match card / admin match panel, so redirects can land on it. */
export function matchAnchor(fixtureId: string): string {
    return `match-${fixtureId.replace(/[^A-Za-z0-9_-]/g, '-')}`
}
