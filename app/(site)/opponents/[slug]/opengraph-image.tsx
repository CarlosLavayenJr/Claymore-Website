import { client } from '@/sanity/lib/client'
import {
    matchesQuery,
    teamBySlugQuery,
    type SanityMatch,
    type SanityTeam,
} from '@/sanity/lib/queries'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'
import { isClaymores, opponentOf, matchOutcome } from '@/lib/seo'

export const alt = 'Claymores vs Opponent — Florida Rugby'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const team: SanityTeam | null = await client.fetch(teamBySlugQuery, { slug })
    const matches: SanityMatch[] = await client.fetch(matchesQuery)

    const opponentName = team?.name ?? 'Opponent'
    const h2h = matches.filter(
        (m) =>
            m.status === 'played' &&
            ((isClaymores(m.homeTeam) && opponentOf(m).toLowerCase() === opponentName.toLowerCase()) ||
                (isClaymores(m.awayTeam) && opponentOf(m).toLowerCase() === opponentName.toLowerCase())),
    )

    let w = 0
    let l = 0
    let d = 0
    for (const m of h2h) {
        const r = matchOutcome(m)
        if (r === 'win') w++
        else if (r === 'loss') l++
        else if (r === 'draw') d++
    }

    return brandedImageResponse({
        eyebrow: 'Head-to-Head',
        title: `Claymores vs ${opponentName}`,
        subtitle: h2h.length
            ? `Claymores ${w}-${l}${d ? `-${d}` : ''} all-time · ${h2h.length} matches`
            : `${team?.city ?? 'Florida'} · Florida Rugby Union`,
        accent: '#77c3ef',
    })
}
