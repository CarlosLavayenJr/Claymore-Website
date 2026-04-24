import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'
import {
    formatMatchDateLong,
    isClaymores,
    matchOutcome,
    matchSlug,
    opponentOf,
} from '@/lib/seo'
import { brandedImageResponse, OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og'

export const alt = 'Central Florida Claymores RFC match'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    const match = matches.find((m) => matchSlug(m) === slug)
    if (!match) {
        return brandedImageResponse({
            title: 'Claymores Rugby',
            subtitle: 'Orlando · Florida Rugby Union',
        })
    }

    const opp = opponentOf(match)
    const outcome = matchOutcome(match)
    const home = isClaymores(match.homeTeam)
    const dateStr = formatMatchDateLong(match.date)

    const accent = outcome === 'win' ? '#77c3ef' : '#fd80b5'
    const badge =
        outcome === 'win'
            ? 'WIN'
            : outcome === 'loss'
            ? 'LOSS'
            : outcome === 'draw'
            ? 'DRAW'
            : outcome === 'cancelled'
            ? 'CANCELLED'
            : home
            ? 'HOME'
            : 'AWAY'

    const title = `${home ? 'CLAYMORES vs ' : '@ '}${opp.toUpperCase()}`

    const score =
        match.status === 'played' ? (
            <div
                style={{
                    display: 'flex',
                    gap: 28,
                    fontSize: 90,
                    fontWeight: 900,
                    color: accent,
                    fontFamily: 'sans-serif',
                    letterSpacing: -2,
                }}
            >
                <span>{match.homeScore}</span>
                <span style={{ color: '#555' }}>–</span>
                <span>{match.awayScore}</span>
            </div>
        ) : null

    return brandedImageResponse({
        eyebrow: `Claymores · ${dateStr}`,
        title,
        subtitle: match.competition ?? 'Florida Rugby Union',
        badge,
        accent,
        extra: score,
    })
}
