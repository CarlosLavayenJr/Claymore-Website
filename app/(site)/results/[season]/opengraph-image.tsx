import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import { isClaymores, matchOutcome } from '@/lib/seo'

export const alt = 'Claymores Season Results'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ season: string }> }) {
    const { season: seasonParam } = await params
    const season = Number(seasonParam)
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    const seasonMatches = matches.filter((m) => m.season === season && m.status === 'played')

    let w = 0
    let l = 0
    let d = 0
    let pf = 0
    let pa = 0
    for (const m of seasonMatches) {
        const home = isClaymores(m.homeTeam)
        pf += (home ? m.homeScore : m.awayScore) ?? 0
        pa += (home ? m.awayScore : m.homeScore) ?? 0
        const outcome = matchOutcome(m)
        if (outcome === 'win') w++
        else if (outcome === 'loss') l++
        else if (outcome === 'draw') d++
    }

    return brandedImageResponse({
        eyebrow: `Season ${season}`,
        title: `${w}-${l}${d ? `-${d}` : ''}`,
        subtitle: `${seasonMatches.length} matches · ${pf} for · ${pa} against`,
        badge: `${season}`,
        accent: '#77c3ef',
    })
}
