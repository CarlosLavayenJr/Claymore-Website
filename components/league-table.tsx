import Image from 'next/image'
import Link from 'next/link'
import { cache } from 'react'
import { client } from '@/sanity/lib/client'
import {
    currentLeagueStandingsQuery,
    leagueStandingsBySeasonQuery,
    teamsQuery,
    type SanityLeagueStandings,
    type SanityStandingRow,
    type SanityTeam,
} from '@/sanity/lib/queries'
import { resolveTeam, type ResolvedTeam } from '@/lib/teams'

export const getCurrentStandings = cache(async (): Promise<SanityLeagueStandings | null> => {
    return client.fetch(currentLeagueStandingsQuery)
})

export const getStandingsForSeason = cache(
    async (seasonLabel: string): Promise<SanityLeagueStandings | null> => {
        return client.fetch(leagueStandingsBySeasonQuery, { seasonLabel })
    },
)

const getAllTeams = cache(async (): Promise<SanityTeam[]> => {
    return client.fetch(teamsQuery)
})

interface LeagueTableProps {
    /** When omitted, loads the currently-active championship's standings. */
    seasonLabel?: string
    /**
     * 'full' (default) — Pos · Team · Pool · P · W · L · D · PD · BP · Pts. Matches the rugbyfl.com reference image.
     * 'compact' — Pos · Team · W · L · Pts. Fits in a ~24rem-wide rail on the homepage.
     */
    variant?: 'full' | 'compact'
    /** Optional class applied to the outer card. */
    className?: string
}

const POOL_STYLES: Record<string, string> = {
    north: 'bg-[#77c3ef]/15 text-[#0a5a8c] border-[#77c3ef]/40',
    south: 'bg-[#fd80b5]/15 text-[#9a2168] border-[#fd80b5]/40',
    combo: 'bg-[#EAEAEA] text-[#444] border-[#D4D4D4]',
    unique: 'bg-[#EAEAEA] text-[#444] border-[#D4D4D4]',
}

function poolBadgeClass(pool: string | null): string {
    if (!pool) return POOL_STYLES.combo
    const key = pool.toLowerCase().trim()
    return POOL_STYLES[key] ?? POOL_STYLES.combo
}

export default async function LeagueTable({
    seasonLabel,
    variant = 'full',
    className = '',
}: LeagueTableProps) {
    const [doc, teams] = await Promise.all([
        seasonLabel ? getStandingsForSeason(seasonLabel) : getCurrentStandings(),
        getAllTeams(),
    ])

    if (!doc || !doc.rows || doc.rows.length === 0) {
        return (
            <aside
                className={`border border-[#EAEAEA] rounded-xl bg-white p-6 text-center ${className}`}
            >
                <p className="text-sm text-[#555]">Standings TBD.</p>
            </aside>
        )
    }

    const resolved = doc.rows.map((row) => ({
        row,
        team: resolveTeam(row.teamName, teams),
    }))

    if (variant === 'compact') {
        return <CompactTable doc={doc} resolved={resolved} className={className} />
    }
    return <FullTable doc={doc} resolved={resolved} className={className} />
}

interface InnerProps {
    doc: SanityLeagueStandings
    resolved: Array<{ row: SanityStandingRow; team: ResolvedTeam }>
    className: string
}

function FullTable({ doc, resolved, className }: InnerProps) {
    return (
        <section
            className={`border border-[#EAEAEA] rounded-xl bg-white overflow-hidden shadow-sm ${className}`}
            aria-labelledby="league-table-heading"
        >
            <header className="bg-[#fd80b5] text-white px-4 py-3">
                <h2 id="league-table-heading" className="font-claymore text-lg leading-tight">
                    {doc.divisionName ?? 'League Standings'} {doc.seasonLabel}
                </h2>
            </header>

            <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-[#555] border-b border-[#EAEAEA] hidden md:block">
                <span className="font-bold">P</span>={'\u00A0'}Played{' '}|{' '}
                <span className="font-bold">W</span>={'\u00A0'}Wins{' '}|{' '}
                <span className="font-bold">L</span>={'\u00A0'}Losses{' '}|{' '}
                <span className="font-bold">D</span>={'\u00A0'}Draws{' '}|{' '}
                <span className="font-bold">PD</span>={'\u00A0'}Points Difference{' '}|{' '}
                <span className="font-bold">BP</span>={'\u00A0'}Bonus Points{' '}|{' '}
                <span className="font-bold">Pts</span>={'\u00A0'}Total Points
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="text-left text-[11px] uppercase tracking-widest text-[#555] border-b border-[#EAEAEA] bg-[#FAFAFA]">
                            <th scope="col" className="px-3 py-2.5 w-10">Pos</th>
                            <th scope="col" className="px-3 py-2.5">Team</th>
                            <th scope="col" className="px-3 py-2.5 hidden md:table-cell">Pool</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-10">P</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-10">W</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-10">L</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-10">D</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-14 hidden sm:table-cell">PD</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-12 hidden sm:table-cell">BP</th>
                            <th scope="col" className="px-2 py-2.5 text-center w-12">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resolved.map(({ row, team }) => (
                            <Row key={`${row.position}-${row.teamName}`} row={row} team={team} />
                        ))}
                    </tbody>
                </table>
            </div>

            <footer className="px-4 py-2.5 border-t border-[#EAEAEA] text-right">
                <Link
                    href={`/results/${seasonYearForUrl(doc.seasonLabel)}`}
                    className="text-[10px] font-semibold uppercase tracking-widest text-[#fd80b5] hover:underline"
                >
                    Full standings →
                </Link>
            </footer>
        </section>
    )
}

function Row({ row, team }: { row: SanityStandingRow; team: ResolvedTeam }) {
    const isUs = team.isClaymores
    const baseBg = isUs ? 'bg-[#fd80b5]/10' : 'bg-white'
    const fontWeight = isUs ? 'font-bold' : ''
    return (
        <tr className={`${baseBg} ${fontWeight} border-b border-[#EAEAEA] last:border-b-0 hover:bg-[#FAFAFA] transition-colors`}>
            <td className="px-3 py-2.5 text-[#555]">{row.position}</td>
            <td className="px-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
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
                    {(() => {
                        const href = team.isClaymores ? '/team' : team.slug ? `/opponents/${team.slug}` : null
                        return href ? (
                            <Link href={href} className="truncate text-[#111] hover:underline">
                                {team.name}
                            </Link>
                        ) : (
                            <span className="truncate text-[#111]">{team.name}</span>
                        )
                    })()}
                </div>
            </td>
            <td className="px-3 py-2.5 hidden md:table-cell">
                <PoolBadge pool={row.pool} />
            </td>
            <td className="px-2 py-2.5 text-center tabular-nums">{row.played}</td>
            <td className="px-2 py-2.5 text-center tabular-nums">{row.won}</td>
            <td className="px-2 py-2.5 text-center tabular-nums">{row.lost}</td>
            <td className="px-2 py-2.5 text-center tabular-nums">{row.drawn}</td>
            <td className="px-2 py-2.5 text-center tabular-nums hidden sm:table-cell">
                {formatSigned(row.pointsDifference)}
            </td>
            <td className="px-2 py-2.5 text-center tabular-nums hidden sm:table-cell">{row.bonusPoints}</td>
            <td className="px-2 py-2.5 text-center tabular-nums font-semibold">{row.totalPoints}</td>
        </tr>
    )
}

function CompactTable({ doc, resolved, className }: InnerProps) {
    return (
        <aside
            className={`border border-[#EAEAEA] rounded-xl bg-white overflow-hidden shadow-sm aspect-square flex flex-col ${className}`}
            aria-labelledby="league-table-heading-compact"
        >
            <header className="bg-[#fd80b5] text-white px-4 py-3 shrink-0 flex items-center justify-between">
                <h2 id="league-table-heading-compact" className="font-claymore text-base leading-tight truncate">
                    {doc.divisionName ?? 'Standings'}
                </h2>
                <span className="text-[10px] uppercase tracking-widest opacity-80">{doc.seasonLabel}</span>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto">
                <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#FAFAFA]">
                        <tr className="text-left text-[10px] uppercase tracking-widest text-[#555] border-b border-[#EAEAEA]">
                            <th scope="col" className="px-2 py-2 w-7">#</th>
                            <th scope="col" className="px-2 py-2">Team</th>
                            <th scope="col" className="px-1.5 py-2 text-center w-7">W</th>
                            <th scope="col" className="px-1.5 py-2 text-center w-7">L</th>
                            <th scope="col" className="px-1.5 py-2 text-center w-9 font-bold">Pts</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resolved.map(({ row, team }) => {
                            const isUs = team.isClaymores
                            const href = isUs ? '/team' : team.slug ? `/opponents/${team.slug}` : null
                            const teamInner = (
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {team.logoUrl ? (
                                        <Image
                                            src={team.logoUrl}
                                            alt={team.logoAlt ?? `${team.name} logo`}
                                            width={18}
                                            height={18}
                                            className="w-4.5 h-4.5 shrink-0 object-contain"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="w-4 h-4 shrink-0 rounded-full bg-[#EAEAEA]" aria-hidden="true" />
                                    )}
                                    <span className="truncate text-[#111]">{team.name}</span>
                                </div>
                            )
                            return (
                                <tr
                                    key={`${row.position}-${row.teamName}`}
                                    className={`border-b border-[#EAEAEA] last:border-b-0 ${
                                        isUs ? 'bg-[#fd80b5]/10 font-bold' : 'bg-white'
                                    } ${href ? 'hover:bg-[#F9F9F9] cursor-pointer transition-colors' : ''}`}
                                >
                                    <td className="px-2 py-1.5 text-[#555] tabular-nums">{row.position}</td>
                                    <td className="px-2 py-1.5">
                                        {href ? (
                                            <Link
                                                href={href}
                                                className="block hover:opacity-80 transition-opacity"
                                                aria-label={`${team.name} ${isUs ? 'team page' : 'opponent page'}`}
                                            >
                                                {teamInner}
                                            </Link>
                                        ) : (
                                            teamInner
                                        )}
                                    </td>
                                    <td className="px-1.5 py-1.5 text-center tabular-nums">{row.won}</td>
                                    <td className="px-1.5 py-1.5 text-center tabular-nums">{row.lost}</td>
                                    <td className="px-1.5 py-1.5 text-center tabular-nums">{row.totalPoints}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            <footer className="px-3 py-2 border-t border-[#EAEAEA] text-right shrink-0">
                <Link
                    href={`/results/${seasonYearForUrl(doc.seasonLabel)}`}
                    className="text-[10px] font-semibold uppercase tracking-widest text-[#fd80b5] hover:underline"
                >
                    Full standings →
                </Link>
            </footer>
        </aside>
    )
}

function PoolBadge({ pool }: { pool: string | null }) {
    if (!pool) return null
    return (
        <span
            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest border ${poolBadgeClass(pool)}`}
        >
            {pool}
        </span>
    )
}

function formatSigned(n: number): string {
    if (n > 0) return `+${n}`
    return String(n)
}

// Convert "2025-2026" → "2026" so links match the /results/[season] route which
// uses the closing year as its URL segment.
function seasonYearForUrl(seasonLabel: string): string {
    const range = seasonLabel.match(/(\d{4})\s*-\s*(\d{4})/)
    if (range) return range[2]
    const single = seasonLabel.match(/\d{4}/)
    return single ? single[0] : seasonLabel
}

