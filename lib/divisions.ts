import type { SanitySeasonDivision } from '@/sanity/lib/queries'

/**
 * Pulls a short division code (e.g. "D3", "D4") out of a competition or
 * division name like "FRU Men Division 4". Tolerant of the rugbyfl.com
 * misspelling "Divison" we've seen on historic data. Returns undefined
 * when no digit is present.
 */
export function divisionCodeFromName(name: string | null | undefined): string | undefined {
    if (!name) return undefined
    const longForm = name.match(/\bDivisi?on\s*([1-9])\b/i)
    if (longForm) return `D${longForm[1]}`
    const explicit = name.match(/\bD\s*([1-9])\b/i)
    if (explicit) return `D${explicit[1]}`
    return undefined
}

/**
 * Builds a map of `season number → division code` from the leagueStandings
 * docs. seasonLabel is shaped "YYYY-YYYY" (e.g. "2022-2023") and we key the
 * map on the closing year because that's how matches are stored
 * (`m.season = 2023` for the 2022-2023 season).
 */
export function buildDivisionsBySeason(
    docs: SanitySeasonDivision[],
): Record<number, string | undefined> {
    const map: Record<number, string | undefined> = {}
    for (const doc of docs) {
        const code = divisionCodeFromName(doc.divisionName)
        if (!code) continue
        const range = doc.seasonLabel.match(/(\d{4})\s*-\s*(\d{4})/)
        const single = doc.seasonLabel.match(/^\s*(\d{4})\s*$/)
        const year = range ? Number(range[2]) : single ? Number(single[1]) : null
        if (year != null && !map[year]) map[year] = code
    }
    return map
}
