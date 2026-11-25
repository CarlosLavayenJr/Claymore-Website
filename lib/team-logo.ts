import type { SanityTeam } from '@/sanity/lib/queries'

/** The crest for a team name, matching the team's name or any alias loosely ("Lakeland (D3)" → Lakeland Lancers). */
export function findTeamLogo(name: string, teams: SanityTeam[]): string | null {
    const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    // Division tags like "(D3)" aren't part of the club's name.
    const n = normalized(name.replace(/\(\s*D[1-4]\s*\)|\bD[1-4]\b/gi, ''))
    if (!n) return null
    for (const team of teams) {
        const candidates = [team.name, ...(team.aliases ?? [])]
        if (candidates.some(alias => n.includes(normalized(alias)) || normalized(alias).includes(n))) {
            return team.logoUrl ?? null
        }
    }
    return null
}
