'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown } from 'lucide-react'
import { Info } from 'lucide-react'
import type { SanityMatch, SanityTeam } from '@/sanity/lib/queries'
import { matchSlug } from '@/lib/seo'
import { divisionCodeFromName } from '@/lib/divisions'
import MatchTypeBadge from '@/components/match-type-badge'

function FilterSelect({ value, onChange, options, width = 'w-[160px]' }: {
    value: string
    onChange: (v: string) => void
    options: { label: string; value: string; logo?: string | null }[]
    width?: string
}) {
    const [open, setOpen] = useState(false)
    const selected = options.find(o => o.value === value)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button className={`flex h-9 items-center justify-between whitespace-nowrap rounded-md border border-[#EAEAEA] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#77c3ef] w-full sm:${width}`}>
                    <span className="flex items-center gap-2">
                        {selected?.logo && <img src={selected.logo} alt={selected.label} className="w-4 h-4 object-contain" />}
                        {selected?.label}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-1 w-[200px]">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => { onChange(opt.value); setOpen(false) }}
                        className="relative flex w-full items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-sm hover:bg-accent cursor-pointer"
                    >
                        {opt.logo && <img src={opt.logo} alt={opt.label} className="w-4 h-4 object-contain shrink-0" />}
                        {opt.label}
                        {opt.value === value && <Check className="absolute right-2 h-4 w-4" />}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    )
}

function normalizeTeamName(name: string): string {
    return name.replace(/ \(D[34]\)/g, '').replace(/ D[34]/g, '').replace('IR/', '')
}

function isClaymores(name: string): boolean {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

/**
 * Resolves a match's division code. Prefers the match's own `competition`
 * field (most accurate — set by the scraper from rugbyfl.com per game),
 * then falls back to the season → division map (built from leagueStandings
 * docs), then to scanning team-name suffixes like "(D4)".
 */
function divisionCode(m: SanityMatch, divisionsBySeason: Record<number, string | undefined>): string | undefined {
    const fromCompetition = divisionCodeFromName(m.competition)
    if (fromCompetition) return fromCompetition
    const fromMap = divisionsBySeason[m.season]
    if (fromMap) return fromMap
    return divisionCodeFromName(`${m.homeTeam} ${m.awayTeam}`)
}

type Result = 'W' | 'L' | 'D' | null

function getResult(m: SanityMatch): Result {
    if (m.status === 'upcoming' || m.status === 'cancelled') return null
    if (m.status === 'forfeit_us') return 'L'
    if (m.status === 'forfeit_them') return 'W'
    const weHome = isClaymores(m.homeTeam)
    const ours = weHome ? m.homeScore : m.awayScore
    const theirs = weHome ? m.awayScore : m.homeScore
    if (ours > theirs) return 'W'
    if (ours < theirs) return 'L'
    return 'D'
}

const RESULT_PILL: Record<'W' | 'L' | 'D', string> = {
    W: 'bg-[#77c3ef] text-white',
    L: 'bg-[#EAEAEA] text-[#555555]',
    D: 'bg-[#fd80b5] text-white',
}

function findTeamLogo(name: string, teams: SanityTeam[]): string | null {
    const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const n = normalized(name)
    for (const team of teams) {
        const candidates = [team.name, ...(team.aliases ?? [])]
        if (candidates.some(alias => n.includes(normalized(alias)) || normalized(alias).includes(n))) {
            return team.logoUrl ?? null
        }
    }
    return null
}

interface MatchResultsTableProps {
    matches: SanityMatch[]
    teams: SanityTeam[]
    /** Map of season number → division code (e.g. 2023 → "D4"). Built server-side from leagueStandings docs. */
    divisionsBySeason?: Record<number, string | undefined>
}

export default function MatchResultsTable({ matches, teams, divisionsBySeason = {} }: MatchResultsTableProps) {
    const router = useRouter()
    const dateColRef = useRef<HTMLTableCellElement>(null)
    const [selectedOpponent, setSelectedOpponent] = useState('all')
    const [selectedMatchType, setSelectedMatchType] = useState('all')

    // On mobile (< sm = 640px) the table overflows horizontally. Scroll past
    // the Date column on mount so Home is the first visible column; the
    // shadcn `<Table>` renders its own scrolling `<div>` around the `<table>`
    // so we have to look it up to set scrollLeft.
    useEffect(() => {
        const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
        if (!isMobile) return
        const dateCell = dateColRef.current
        const scroller = dateCell?.closest('div[class*="overflow"]') as HTMLDivElement | null
        if (!scroller || !dateCell) return
        scroller.scrollLeft = dateCell.offsetWidth
    }, [])

    const [selectedSeason, setSelectedSeason] = useState(() => {
        const s = new Set<number>()
        matches.forEach(m => s.add(m.season))
        const latest = Math.max(...Array.from(s))
        return isFinite(latest) ? latest.toString() : 'all'
    })

    const seasons = useMemo(() => {
        const set = new Set<number>()
        matches.forEach((m) => set.add(m.season))
        return Array.from(set).sort((a, b) => b - a)
    }, [matches])

    const opponents = useMemo(() => {
        const set = new Set<string>()
        matches.forEach((m) => {
            if (m.status === 'cancelled') return
            const opp = isClaymores(m.homeTeam) ? normalizeTeamName(m.awayTeam) : normalizeTeamName(m.homeTeam)
            set.add(opp)
        })
        return Array.from(set).sort()
    }, [matches])

    const filtered = useMemo(() => {
        return matches.filter((m) => {
            if (selectedSeason !== 'all' && m.season.toString() !== selectedSeason) return false
            if (selectedMatchType !== 'all' && (m.matchType ?? 'league') !== selectedMatchType) return false
            if (selectedOpponent !== 'all') {
                const home = normalizeTeamName(m.homeTeam)
                const away = normalizeTeamName(m.awayTeam)
                const opp = normalizeTeamName(selectedOpponent)
                if (home !== opp && away !== opp) return false
            }
            return true
        })
    }, [matches, selectedSeason, selectedMatchType, selectedOpponent])

    const leagueCodesPresent = useMemo(() => {
        const set = new Set<string>()
        for (const m of filtered) {
            if (m.matchType === 'friendly') continue
            const code = divisionCode(m, divisionsBySeason)
            if (code) set.add(code)
        }
        return Array.from(set).sort()
    }, [filtered, divisionsBySeason])

    const hasFriendlies = useMemo(
        () => filtered.some((m) => m.matchType === 'friendly'),
        [filtered],
    )

    const stats = useMemo(() => {
        let wins = 0, losses = 0, draws = 0, pf = 0, pa = 0, upcoming = 0, cancelled = 0
        filtered.forEach((m) => {
            if (m.status === 'upcoming') { upcoming++; return }
            if (m.status === 'cancelled') { cancelled++; return }
            const weHome = isClaymores(m.homeTeam)
            const ourScore = weHome ? m.homeScore : m.awayScore
            const theirScore = weHome ? m.awayScore : m.homeScore
            if (m.status === 'forfeit_us') { losses++; pa += 20 }
            else if (m.status === 'forfeit_them') { wins++; pf += 20 }
            else {
                pf += ourScore; pa += theirScore
                if (ourScore > theirScore) wins++
                else if (ourScore < theirScore) losses++
                else draws++
            }
        })
        return { wins, losses, draws, pf, pa, diff: pf - pa, played: filtered.length - upcoming - cancelled, upcoming }
    }, [filtered])

    const getScore = (m: SanityMatch) => {
        if (m.status === 'upcoming') return '—'
        if (m.status === 'cancelled') return 'CANCELLED'
        if (m.status === 'forfeit_us' || m.status === 'forfeit_them') return `${m.homeScore} – ${m.awayScore}`
        return `${m.homeScore} – ${m.awayScore}`
    }

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', timeZone: 'UTC' })

    return (
        <div className="w-full">
            {/* Stats strip */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-px bg-[#EAEAEA] border border-[#EAEAEA] rounded-xl overflow-hidden mb-8">
                {[
                    { label: 'Wins', value: stats.wins, accent: 'text-[#77c3ef]' },
                    { label: 'Losses', value: stats.losses, accent: 'text-[#555555]' },
                    { label: 'Draws', value: stats.draws, accent: 'text-[#fd80b5]' },
                    { label: 'Played', value: stats.played, accent: 'text-[#111111]' },
                    { label: 'PF', value: stats.pf, accent: 'text-[#111111]' },
                    { label: 'PA', value: stats.pa, accent: 'text-[#111111]' },
                    { label: '+/−', value: stats.diff, accent: stats.diff >= 0 ? 'text-[#77c3ef]' : 'text-[#555555]' },
                ].map(({ label, value, accent }) => (
                    <div key={label} className="bg-white py-4 text-center">
                        <div className={`text-2xl font-bold font-claymore ${accent}`}>{value}</div>
                        <div className="text-xs uppercase tracking-widest text-[#555555] mt-1">{label}</div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <FilterSelect
                    value={selectedSeason}
                    onChange={setSelectedSeason}
                    width="w-[160px]"
                    options={[
                        { label: 'All Seasons', value: 'all' },
                        ...seasons.map(s => ({ label: `${s} Season`, value: s.toString() })),
                    ]}
                />
                <FilterSelect
                    value={selectedMatchType}
                    onChange={setSelectedMatchType}
                    width="w-[160px]"
                    options={[
                        { label: 'All Types', value: 'all' },
                        { label: 'League', value: 'league' },
                        { label: 'Friendly', value: 'friendly' },
                    ]}
                />
                <FilterSelect
                    value={selectedOpponent}
                    onChange={setSelectedOpponent}
                    width="w-[200px]"
                    options={[
                        { label: 'All Opponents', value: 'all' },
                        ...opponents.map(o => ({ label: o, value: o, logo: findTeamLogo(o, teams) })),
                    ]}
                />
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-3 mb-2 text-[10px] uppercase tracking-widest text-[#555555] flex-wrap">
                {leagueCodesPresent.length > 0 && (
                    <span className="flex items-center gap-1.5">
                        <span className="flex gap-1">
                            {leagueCodesPresent.map((code) => (
                                <span
                                    key={code}
                                    className="inline-block font-bold text-[9px] px-1.5 py-0.5 rounded border bg-[#77c3ef]/10 text-[#77c3ef] border-[#77c3ef]/30"
                                >
                                    {code}
                                </span>
                            ))}
                        </span>
                        League (division)
                    </span>
                )}
                {hasFriendlies && (
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block font-bold text-[9px] px-1.5 py-0.5 rounded border bg-[#fd80b5]/10 text-[#fd80b5] border-[#fd80b5]/30">
                            Fr
                        </span>
                        Friendly
                    </span>
                )}
            </div>

            {/* Table */}
            <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-[#F9F9F9] hover:bg-[#F9F9F9]">
                            <TableHead ref={dateColRef} className="text-xs uppercase tracking-widest text-[#555555] font-semibold w-[80px]">Date</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold min-w-[160px]">Home</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-center min-w-[90px]">Score</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold min-w-[160px]">Away</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-center w-[60px]">Result</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-center w-[60px]">Type</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-right min-w-[120px] hidden sm:table-cell">Note</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-[#555555] py-12">No matches found</TableCell>
                            </TableRow>
                        ) : filtered.map((m) => {
                            const result = getResult(m)
                            const isUpcoming = m.status === 'upcoming'
                            const isCancelled = m.status === 'cancelled'
                            return (
                                <TableRow
                                    key={m._id}
                                    onClick={() => router.push(`/fixtures/${matchSlug(m)}`)}
                                    className={`border-t border-[#EAEAEA] cursor-pointer hover:bg-[#77c3ef]/5 transition-colors ${isUpcoming ? 'opacity-50' : ''} ${isCancelled ? 'opacity-40 line-through' : ''}`}
                                >
                                    <TableCell className="text-sm text-[#555555]">
                                        {formatDate(m.date)}
                                    </TableCell>
                                    <TableCell className={`text-sm font-medium ${isClaymores(m.homeTeam) ? 'text-[#111111]' : 'text-[#555555]'}`}>
                                        <span className="flex items-center gap-2">
                                            {(m.homeTeamLogo ?? findTeamLogo(m.homeTeam, teams)) && (
                                                <img src={m.homeTeamLogo ?? findTeamLogo(m.homeTeam, teams)!} alt={m.homeTeam} className="w-5 h-5 object-contain shrink-0" />
                                            )}
                                            <span className="min-w-0">{m.homeTeam}</span>
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center font-mono font-semibold text-[#111111]">
                                        {isUpcoming ? <span className="text-xs text-[#77c3ef] uppercase tracking-widest">Upcoming</span> : getScore(m)}
                                    </TableCell>
                                    <TableCell className={`text-sm font-medium ${isClaymores(m.awayTeam) ? 'text-[#111111]' : 'text-[#555555]'}`}>
                                        <span className="flex items-center gap-2">
                                            {(m.awayTeamLogo ?? findTeamLogo(m.awayTeam, teams)) && (
                                                <img src={m.awayTeamLogo ?? findTeamLogo(m.awayTeam, teams)!} alt={m.awayTeam} className="w-5 h-5 object-contain shrink-0" />
                                            )}
                                            <span className="min-w-0">{m.awayTeam}</span>
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {result && (
                                            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${RESULT_PILL[result]}`}>
                                                {result}
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <MatchTypeBadge
                                            matchType={m.matchType}
                                            variant="abbreviated"
                                            size="compact"
                                            leagueLabel={divisionCode(m, divisionsBySeason)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right hidden sm:table-cell">
                                        {m.note && (
                                            <span className="inline-flex items-center gap-1 text-xs text-[#555555]">
                                                <Info className="w-3 h-3 shrink-0" />
                                                {m.note}
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
