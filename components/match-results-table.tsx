'use client'

import { useState, useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronDown } from 'lucide-react'
import { Info } from 'lucide-react'
import type { SanityMatch } from '@/sanity/lib/queries'

function FilterSelect({ value, onChange, options, width = 'w-[160px]' }: {
    value: string
    onChange: (v: string) => void
    options: { label: string; value: string }[]
    width?: string
}) {
    const [open, setOpen] = useState(false)
    const selected = options.find(o => o.value === value)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button className={`flex h-9 items-center justify-between whitespace-nowrap rounded-md border border-[#EAEAEA] bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-[#77c3ef] w-full sm:${width}`}>
                    <span>{selected?.label}</span>
                    <ChevronDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="p-1 w-[200px]">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => { onChange(opt.value); setOpen(false) }}
                        className="relative flex w-full items-center rounded-sm py-1.5 pl-2 pr-8 text-sm hover:bg-accent cursor-pointer"
                    >
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

export default function MatchResultsTable({ matches }: { matches: SanityMatch[] }) {
    const [selectedOpponent, setSelectedOpponent] = useState('all')
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
            if (selectedOpponent === 'all') return true
            const home = normalizeTeamName(m.homeTeam)
            const away = normalizeTeamName(m.awayTeam)
            const opp = normalizeTeamName(selectedOpponent)
            return home === opp || away === opp
        })
    }, [matches, selectedSeason, selectedOpponent])

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
        new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

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
                    value={selectedOpponent}
                    onChange={setSelectedOpponent}
                    width="w-[200px]"
                    options={[
                        { label: 'All Opponents', value: 'all' },
                        ...opponents.map(o => ({ label: o, value: o })),
                    ]}
                />
            </div>

            {/* Table */}
            <div className="border border-[#EAEAEA] rounded-xl overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-[#F9F9F9] hover:bg-[#F9F9F9]">
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold w-[110px]">Date</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold">Home</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-center">Score</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold">Away</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-center w-[60px]">Result</TableHead>
                            <TableHead className="text-xs uppercase tracking-widest text-[#555555] font-semibold text-right hidden sm:table-cell">Note</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filtered.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-[#555555] py-12">No matches found</TableCell>
                            </TableRow>
                        ) : filtered.map((m) => {
                            const result = getResult(m)
                            const isUpcoming = m.status === 'upcoming'
                            const isCancelled = m.status === 'cancelled'
                            return (
                                <TableRow
                                    key={m._id}
                                    className={`border-t border-[#EAEAEA] ${isUpcoming ? 'opacity-50' : ''} ${isCancelled ? 'opacity-40 line-through' : ''}`}
                                >
                                    <TableCell className="text-sm text-[#555555]">{formatDate(m.date)}</TableCell>
                                    <TableCell className={`text-sm font-medium ${isClaymores(m.homeTeam) ? 'text-[#111111]' : 'text-[#555555]'}`}>
                                        {m.homeTeam}
                                    </TableCell>
                                    <TableCell className="text-center font-mono font-semibold text-[#111111]">
                                        {isUpcoming ? <span className="text-xs text-[#77c3ef] uppercase tracking-widest">Upcoming</span> : getScore(m)}
                                    </TableCell>
                                    <TableCell className={`text-sm font-medium ${isClaymores(m.awayTeam) ? 'text-[#111111]' : 'text-[#555555]'}`}>
                                        {m.awayTeam}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {result && (
                                            <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${RESULT_PILL[result]}`}>
                                                {result}
                                            </span>
                                        )}
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
