import Image from 'next/image'
import Link from 'next/link'
import { cache } from 'react'
import { client } from '@/sanity/lib/client'
import {
    leagueStandingsBySeasonQuery,
    teamsQuery,
    type PlayoffRound,
    type SanityLeagueStandings,
    type SanityPlayoffMatch,
    type SanityTeam,
} from '@/sanity/lib/queries'
import { resolveTeam, type ResolvedTeam } from '@/lib/teams'

const getAllTeams = cache(async (): Promise<SanityTeam[]> => {
    return client.fetch(teamsQuery)
})

const getStandingsForSeason = cache(
    async (seasonLabel: string): Promise<SanityLeagueStandings | null> => {
        return client.fetch(leagueStandingsBySeasonQuery, { seasonLabel })
    },
)

interface PlayoffBracketProps {
    /** When provided, fetches playoffs by seasonLabel (e.g. "2022-2023"). */
    seasonLabel?: string
    /** Or pass the playoffs array directly (lets parents share a doc fetch). */
    playoffs?: SanityPlayoffMatch[] | null
    /** Heading suffix. Falls back to seasonLabel when provided. */
    headingLabel?: string
    className?: string
}

const ROUND_ORDER: PlayoffRound[] = ['quarter', 'semi', 'third', 'final']

const ROUND_TITLE: Record<PlayoffRound, string> = {
    quarter: 'Quarter-Finals',
    semi: 'Semi-Finals',
    third: '3rd Place',
    final: 'Final',
}

export default async function PlayoffBracket({
    playoffs,
    seasonLabel,
    headingLabel,
    className = '',
}: PlayoffBracketProps) {
    let resolvedPlayoffs: SanityPlayoffMatch[] | null | undefined = playoffs
    let label = headingLabel ?? seasonLabel ?? ''

    if (!resolvedPlayoffs && seasonLabel) {
        const doc = await getStandingsForSeason(seasonLabel)
        resolvedPlayoffs = doc?.playoffs ?? null
        label = headingLabel ?? doc?.seasonLabel ?? seasonLabel
    }

    if (!resolvedPlayoffs || resolvedPlayoffs.length === 0) return null

    const teams = await getAllTeams()

    // Bucket by round, preserving source order (which is chronological).
    const byRound = new Map<PlayoffRound, SanityPlayoffMatch[]>()
    for (const m of resolvedPlayoffs) {
        const list = byRound.get(m.round) ?? []
        list.push(m)
        byRound.set(m.round, list)
    }

    const columns = ROUND_ORDER.filter((r) => byRound.has(r)).map((round) => ({
        round,
        title: ROUND_TITLE[round],
        matches: byRound.get(round)!,
    }))

    if (columns.length === 0) return null

    return (
        <section
            className={`border border-[#EAEAEA] rounded-xl bg-white overflow-hidden shadow-sm ${className}`}
            aria-labelledby="playoff-bracket-heading"
        >
            <header className="bg-[#fd80b5] text-white px-4 py-3 flex items-baseline justify-between gap-3">
                <h2 id="playoff-bracket-heading" className="font-claymore text-lg leading-tight">
                    Playoffs {label}
                </h2>
                <span className="text-[10px] uppercase tracking-widest text-white/80">
                    Bracket
                </span>
            </header>

            <div className="overflow-x-auto">
                <div
                    className="flex gap-6 md:gap-10 p-4 md:p-6 min-w-max"
                    role="list"
                    aria-label="Playoff rounds"
                >
                    {columns.map((col) => (
                        <RoundColumn
                            key={col.round}
                            title={col.title}
                            matches={col.matches}
                            teams={teams}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

function RoundColumn({
    title,
    matches,
    teams,
}: {
    title: string
    matches: SanityPlayoffMatch[]
    teams: SanityTeam[]
}) {
    return (
        <div
            role="listitem"
            className="flex flex-col justify-center gap-4 md:gap-6 min-w-[16rem] md:min-w-[18rem]"
        >
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#555] text-center">
                {title}
            </h3>
            <div className="flex flex-col gap-4 md:gap-6 flex-1 justify-around">
                {matches.map((m, i) => (
                    <BracketMatch key={`${title}-${i}-${m.homeTeam}-${m.awayTeam}`} match={m} teams={teams} />
                ))}
            </div>
        </div>
    )
}

function BracketMatch({ match, teams }: { match: SanityPlayoffMatch; teams: SanityTeam[] }) {
    const home = resolveTeam(match.homeTeam, teams)
    const away = resolveTeam(match.awayTeam, teams)
    const hs = match.homeScore
    const as = match.awayScore
    const hasScores = typeof hs === 'number' && typeof as === 'number'
    const homeWon = hasScores && hs! > as!
    const awayWon = hasScores && as! > hs!

    return (
        <article className="rounded-lg border border-[#EAEAEA] bg-white shadow-sm overflow-hidden">
            {match.label || match.date ? (
                <div className="px-3 py-1.5 bg-[#FAFAFA] border-b border-[#EAEAEA] flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-[#777]">
                    <span className="truncate">{match.label ?? ''}</span>
                    {match.date && <time dateTime={match.date}>{formatShortDate(match.date)}</time>}
                </div>
            ) : null}
            <TeamRow team={home} score={hs} won={homeWon} />
            <div className="h-px bg-[#EAEAEA]" />
            <TeamRow team={away} score={as} won={awayWon} />
        </article>
    )
}

function TeamRow({
    team,
    score,
    won,
}: {
    team: ResolvedTeam
    score: number | null
    won: boolean
}) {
    const isUs = team.isClaymores
    const href = isUs ? '/team' : team.slug ? `/opponents/${team.slug}` : null
    const bg = won ? 'bg-[#fd80b5]/10' : 'bg-white'
    const fontWeight = won ? 'font-bold text-[#111]' : 'text-[#333]'

    const body = (
        <div className={`flex items-center gap-2.5 px-3 py-2.5 ${bg} ${fontWeight}`}>
            {team.logoUrl ? (
                <Image
                    src={team.logoUrl}
                    alt={team.logoAlt ?? `${team.name} logo`}
                    width={24}
                    height={24}
                    className="w-6 h-6 shrink-0 object-contain"
                    unoptimized
                />
            ) : (
                <div className="w-6 h-6 shrink-0 rounded-full bg-[#EAEAEA]" aria-hidden="true" />
            )}
            <span className={`flex-1 truncate text-sm ${isUs ? 'text-[#111]' : ''}`}>{team.name}</span>
            <span className="tabular-nums font-mono text-base shrink-0">
                {typeof score === 'number' ? score : '—'}
            </span>
        </div>
    )

    if (!href) return body
    return (
        <Link href={href} className="block hover:bg-[#FAFAFA] transition-colors">
            {body}
        </Link>
    )
}

function formatShortDate(iso: string): string {
    // iso is YYYY-MM-DD — parse in UTC to avoid TZ off-by-one on display.
    const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
    if (!y || !m || !d) return iso
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })
}
