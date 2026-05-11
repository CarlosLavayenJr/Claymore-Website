import type { SanityPractice } from '@/sanity/lib/queries'

export interface PracticeInstance {
    practice: SanityPractice
    date: string
    key: string
}

const DAY_TOKEN_TO_IDX: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

function toIsoDate(d: Date): string {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function parseIsoDate(s: string): Date {
    return new Date(`${s}T00:00:00Z`)
}

export function expandPractice(p: SanityPractice, from: string, to: string): PracticeInstance[] {
    if (!p.active || !p.startDate) return []

    const fromD = parseIsoDate(from)
    const toD = parseIsoDate(to)
    const startD = parseIsoDate(p.startDate)

    if (!p.recurring) {
        if (startD >= fromD && startD <= toD) {
            return [{ practice: p, date: p.startDate, key: `${p._id}-${p.startDate}` }]
        }
        return []
    }

    const allowed = new Set(
        (p.weekdays ?? [])
            .map(w => DAY_TOKEN_TO_IDX[w])
            .filter((v): v is number => v !== undefined),
    )
    if (allowed.size === 0) return []

    const out: PracticeInstance[] = []
    const cursor = new Date(Math.max(startD.getTime(), fromD.getTime()))
    while (cursor <= toD) {
        if (allowed.has(cursor.getUTCDay())) {
            const iso = toIsoDate(cursor)
            out.push({ practice: p, date: iso, key: `${p._id}-${iso}` })
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return out
}

export function expandPractices(
    practices: SanityPractice[],
    from: string,
    to: string,
): PracticeInstance[] {
    return practices.flatMap(p => expandPractice(p, from, to))
}

export function upcomingPracticeInstances(
    practices: SanityPractice[],
    count: number,
    horizonDays = 60,
): PracticeInstance[] {
    const today = new Date()
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    const horizon = new Date(todayUtc)
    horizon.setUTCDate(horizon.getUTCDate() + horizonDays)
    const from = toIsoDate(todayUtc)
    const to = toIsoDate(horizon)
    const all = expandPractices(practices, from, to)
    all.sort((a, b) => a.date.localeCompare(b.date))
    return all.slice(0, count)
}
