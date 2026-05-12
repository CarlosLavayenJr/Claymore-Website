import type { SanityTeam } from '@/sanity/lib/queries'

// Normalize a team name so we can compare a scraped string to a Sanity name/alias.
//
//  • lowercase
//  • strip suffixes like "RFC", "FC", "F.C."
//  • strip parenthetical division markers like "(D3)", "(D2)"
//  • collapse punctuation/whitespace
//
// Examples:
//   "Central Florida Claymores RFC"   →  "central florida claymores"
//   "Ft. Lauderdale Knights RFC (D3)" →  "ft lauderdale knights"
//   "SWFL Hammerheads RFC"            →  "swfl hammerheads"
export function normalizeTeamName(input: string): string {
    return input
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ') // strip "(D3)", "(D2)", etc.
        .replace(/\brfc\b/g, ' ')
        .replace(/\bfc\b/g, ' ')
        .replace(/\bf\.c\.\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

export interface ResolvedTeam {
    name: string
    logoUrl: string | null
    logoAlt: string | null
    slug: string | null
    isClaymores: boolean
}

// Try to resolve a scraped team name to one of our Sanity team docs.
//
// Match order (most specific → least):
//   1. exact normalized match on team.name
//   2. exact normalized match on any team.aliases[]
//   3. one side fully contains the other (Sanity name "Brevard" appears in
//      "Brevard Old Red Eye RFC", or vice versa)
//
// Returns a ResolvedTeam with logo info if matched, or just the original name
// (logos null) if not. Caller renders text-only when logo is null.
export function resolveTeam(scrapedName: string, teams: SanityTeam[]): ResolvedTeam {
    const norm = normalizeTeamName(scrapedName)
    const isClaymores = /claymore/i.test(scrapedName)

    if (!norm) {
        return {
            name: scrapedName,
            logoUrl: null,
            logoAlt: null,
            slug: null,
            isClaymores,
        }
    }

    let bestExact: SanityTeam | null = null
    let bestAlias: SanityTeam | null = null
    let bestContains: SanityTeam | null = null

    for (const team of teams) {
        const teamNorm = normalizeTeamName(team.name)
        if (teamNorm && teamNorm === norm) {
            bestExact = team
            break
        }

        if (Array.isArray(team.aliases)) {
            for (const alias of team.aliases) {
                if (normalizeTeamName(alias) === norm) {
                    bestAlias = team
                    break
                }
            }
        }
        if (bestAlias) continue

        if (
            teamNorm &&
            (norm.includes(teamNorm) || teamNorm.includes(norm))
        ) {
            // prefer the longer (more specific) candidate when multiple match
            if (!bestContains || normalizeTeamName(bestContains.name).length < teamNorm.length) {
                bestContains = team
            }
        }
    }

    const match = bestExact ?? bestAlias ?? bestContains
    if (!match) {
        return {
            name: scrapedName,
            logoUrl: null,
            logoAlt: null,
            slug: null,
            isClaymores,
        }
    }

    return {
        name: match.name,
        logoUrl: match.logoUrl,
        logoAlt: match.logoAlt ?? `${match.name} logo`,
        slug: match.slug ?? null,
        isClaymores,
    }
}
