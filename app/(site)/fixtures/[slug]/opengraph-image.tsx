import { ImageResponse } from 'next/og'
import { client } from '@/sanity/lib/client'
import { matchesQuery, type SanityMatch } from '@/sanity/lib/queries'
import {
    formatMatchDateLong,
    isClaymores,
    matchOutcome,
    matchSlug,
    opponentOf,
} from '@/lib/seo'

export const alt = 'Central Florida Claymores RFC match'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
    const matches: SanityMatch[] = await client.fetch(matchesQuery)
    const match = matches.find((m) => matchSlug(m) === params.slug)
    if (!match) return defaultCard()

    const opp = opponentOf(match)
    const outcome = matchOutcome(match)
    const home = isClaymores(match.homeTeam)
    const dateStr = formatMatchDateLong(match.date)

    const accent =
        outcome === 'win' ? '#77c3ef' : outcome === 'loss' ? '#fd80b5' : outcome === 'draw' ? '#fd80b5' : '#77c3ef'
    const labelText =
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

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    background:
                        'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)',
                    color: '#fff',
                    padding: '60px 70px',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 16,
                            letterSpacing: 6,
                            textTransform: 'uppercase',
                            color: '#fd80b5',
                            fontWeight: 700,
                        }}
                    >
                        Central Florida Claymores RFC
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            background: accent,
                            color: '#0b1c25',
                            padding: '8px 18px',
                            borderRadius: 999,
                            fontSize: 18,
                            fontWeight: 800,
                            letterSpacing: 2,
                        }}
                    >
                        {labelText}
                    </div>
                </div>

                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: 14,
                    }}
                >
                    <div style={{ display: 'flex', fontSize: 28, color: '#a8c4d6' }}>{dateStr}</div>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 96,
                            lineHeight: 1.0,
                            fontWeight: 800,
                            letterSpacing: -2,
                        }}
                    >
                        Claymores {home ? 'vs' : '@'} {opp}
                    </div>
                    {match.status === 'played' && (
                        <div
                            style={{
                                display: 'flex',
                                gap: 24,
                                fontSize: 80,
                                fontWeight: 900,
                                color: accent,
                                marginTop: 10,
                            }}
                        >
                            <span>{match.homeScore}</span>
                            <span style={{ color: '#555' }}>–</span>
                            <span>{match.awayScore}</span>
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#77c3ef' }}>
                    <span>{match.competition ?? 'Florida Rugby Union'}</span>
                    <span>claymoresrfc.com</span>
                </div>
            </div>
        ),
        { ...size },
    )
}

function defaultCard() {
    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    background:
                        'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)',
                    color: '#fff',
                    fontSize: 64,
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'sans-serif',
                }}
            >
                Central Florida Claymores RFC
            </div>
        ),
        { ...size },
    )
}
