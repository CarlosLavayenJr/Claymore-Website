'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SanityMatch, SanityTeam } from '@/sanity/lib/queries'

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

function isClaymores(name: string) {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

type Result = 'W' | 'L' | 'D' | 'upcoming' | 'cancelled'

function getResult(m: SanityMatch): Result {
    if (m.status === 'upcoming') return 'upcoming'
    if (m.status === 'cancelled') return 'cancelled'
    if (m.status === 'forfeit_us') return 'L'
    if (m.status === 'forfeit_them') return 'W'
    const weHome = isClaymores(m.homeTeam)
    const ours = weHome ? m.homeScore : m.awayScore
    const theirs = weHome ? m.awayScore : m.homeScore
    if (ours > theirs) return 'W'
    if (ours < theirs) return 'L'
    return 'D'
}

const DOT: Record<Result, string> = {
    W: 'bg-[#77c3ef]',
    L: 'bg-[#AAAAAA]',
    D: 'bg-[#fd80b5]',
    upcoming: 'bg-[#77c3ef]',
    cancelled: 'bg-[#EAEAEA]',
}

const PILL: Record<Result, string> = {
    W: 'bg-[#77c3ef] text-white',
    L: 'bg-[#EAEAEA] text-[#555555]',
    D: 'bg-[#fd80b5] text-white',
    upcoming: 'bg-[#77c3ef]/10 text-[#77c3ef] border border-[#77c3ef]/30',
    cancelled: 'bg-[#EAEAEA] text-[#999]',
}

const RESULT_LABEL: Record<Result, string> = {
    W: 'W', L: 'L', D: 'D', upcoming: 'Upcoming', cancelled: 'Cancelled',
}

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function MatchCard({ m, teams }: { m: SanityMatch, teams: SanityTeam[] }) {
    const result = getResult(m)
    const weHome = isClaymores(m.homeTeam)
    const opponent = weHome ? m.awayTeam : m.homeTeam
    const isPlayed = m.status !== 'upcoming' && m.status !== 'cancelled'
    const ours = weHome ? m.homeScore : m.awayScore
    const theirs = weHome ? m.awayScore : m.homeScore
    const homeLogo = findTeamLogo(m.homeTeam, teams)
    const awayLogo = findTeamLogo(m.awayTeam, teams)

    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[#EAEAEA] bg-white">
            {/* Home */}
            <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                {homeLogo
                    ? <img src={homeLogo} alt={m.homeTeam} className="w-8 h-8 object-contain" />
                    : <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />}
                <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">{m.homeTeam}</p>
            </div>

            {/* Score / result */}
            <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {isPlayed ? (
                    <p className="font-mono text-base font-bold text-[#111111]">{ours} – {theirs}</p>
                ) : (
                    <p className="text-xs font-semibold text-[#77c3ef] uppercase tracking-widest">vs {opponent}</p>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PILL[result]}`}>
                    {RESULT_LABEL[result]}
                </span>
            </div>

            {/* Away */}
            <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                {awayLogo
                    ? <img src={awayLogo} alt={m.awayTeam} className="w-8 h-8 object-contain" />
                    : <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />}
                <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">{m.awayTeam}</p>
            </div>
        </div>
    )
}

// ── Mobile list view ─────────────────────────────────────────────────────────

function MobileList({ matches, teams }: { matches: SanityMatch[], teams: SanityTeam[] }) {
    const grouped = useMemo(() => {
        const latestSeason = Math.max(...matches.map(m => m.season))
        const seasonMatches = matches.filter(m => m.season === latestSeason)

        const upcoming = seasonMatches.filter(m => m.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))
        const past = seasonMatches.filter(m => m.status !== 'upcoming').sort((a, b) => b.date.localeCompare(a.date))
        const sorted = [...upcoming, ...past]

        const map = new Map<string, SanityMatch[]>()
        for (const m of sorted) {
            if (!map.has(m.date)) map.set(m.date, [])
            map.get(m.date)!.push(m)
        }
        return Array.from(map.entries())
    }, [matches])

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    return (
        <div className="divide-y divide-[#EAEAEA]">
            {grouped.map(([date, ms]) => (
                <div key={date} className="py-4">
                    <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold mb-2">
                        {formatDate(date)}
                    </p>
                    <div className="flex flex-col gap-2">
                        {ms.map(m => <MatchCard key={m._id} m={m} teams={teams} />)}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Calendar grid view ────────────────────────────────────────────────────────

export default function MatchCalendar({ matches, teams }: { matches: SanityMatch[], teams: SanityTeam[] }) {
    const today = new Date()
    const [year, setYear] = useState(today.getFullYear())
    const [month, setMonth] = useState(today.getMonth())

    const matchesByDate = useMemo(() => {
        const map = new Map<string, SanityMatch[]>()
        for (const m of matches) {
            if (!map.has(m.date)) map.set(m.date, [])
            map.get(m.date)!.push(m)
        }
        return map
    }, [matches])

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1) }
        else setMonth(m => m - 1)
    }
    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(y => y + 1) }
        else setMonth(m => m + 1)
    }

    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]
    while (cells.length % 7 !== 0) cells.push(null)

    return (
        <div>
            {/* ── Desktop calendar ── */}
            <div className="hidden sm:block">
                {/* Month nav */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={prevMonth}
                        className="p-1.5 rounded-md hover:bg-[#F9F9F9] border border-[#EAEAEA] transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4 text-[#555555]" />
                    </button>
                    <h3 className="font-claymore text-xl text-[#111111]">
                        {MONTHS[month]} {year}
                    </h3>
                    <button
                        onClick={nextMonth}
                        className="p-1.5 rounded-md hover:bg-[#F9F9F9] border border-[#EAEAEA] transition-colors"
                    >
                        <ChevronRight className="w-4 h-4 text-[#555555]" />
                    </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                    {DAYS.map(d => (
                        <div key={d} className="text-center text-xs uppercase tracking-widest text-[#AAAAAA] py-1">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Grid */}
                <div className="grid grid-cols-7 border-l border-t border-[#EAEAEA] rounded-xl overflow-hidden">
                    {cells.map((day, i) => {
                        if (day === null) {
                            return <div key={`empty-${i}`} className="border-r border-b border-[#EAEAEA] bg-[#FAFAFA] h-28" />
                        }
                        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const dayMatches = matchesByDate.get(isoDate) ?? []
                        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

                        const cell = (
                            <div
                                className={`relative border-r border-b border-[#EAEAEA] h-28 overflow-hidden flex flex-col items-center pt-1.5 gap-1 transition-colors
                                    ${dayMatches.length > 0 ? 'bg-white hover:bg-[#77c3ef]/5 cursor-pointer' : 'bg-white cursor-default'}`}
                            >
                                {dayMatches.length > 0 && (() => {
                                    const isHome = isClaymores(dayMatches[0].homeTeam)
                                    return (
                                        <span className={`absolute top-1 left-1.5 text-[9px] font-bold leading-none ${isHome ? 'text-[#77c3ef]' : 'text-[#fd80b5]'}`}>
                                            {isHome ? 'H' : 'A'}
                                        </span>
                                    )
                                })()}
                                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full shrink-0
                                    ${isToday ? 'bg-[#fd80b5] text-white' : 'text-[#111111]'}`}>
                                    {day}
                                </span>
                                <div className="flex gap-0.5 flex-wrap justify-center px-1">
                                    {dayMatches.map(m => {
                                        const homeLogo = findTeamLogo(m.homeTeam, teams)
                                        const awayLogo = findTeamLogo(m.awayTeam, teams)
                                        return (homeLogo || awayLogo) ? (
                                            <span key={m._id} className="relative w-14 h-14 shrink-0">
                                                {homeLogo && (
                                                    <img src={homeLogo} alt={m.homeTeam}
                                                        className="absolute top-0 left-0 w-9 h-9 object-contain" />
                                                )}
                                                <span className="absolute inset-0 flex items-center justify-center text-base text-[#AAAAAA] font-semibold leading-none z-10">
                                                    /
                                                </span>
                                                {awayLogo && (
                                                    <img src={awayLogo} alt={m.awayTeam}
                                                        className="absolute bottom-0 right-0 w-9 h-9 object-contain" />
                                                )}
                                            </span>
                                        ) : (
                                            <span key={m._id} className={`w-1.5 h-1.5 rounded-full ${DOT[getResult(m)]}`} />
                                        )
                                    })}
                                </div>
                            </div>
                        )

                        if (dayMatches.length === 0) return <div key={isoDate}>{cell}</div>

                        return (
                            <Popover key={isoDate}>
                                <PopoverTrigger asChild>
                                    <button className="text-left w-full">{cell}</button>
                                </PopoverTrigger>
                                <PopoverContent side="top" align="center" className="w-72 p-3">
                                    <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold mb-2">
                                        {new Date(isoDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                    </p>
                                    <div className="flex flex-col gap-2">
                                        {dayMatches.map(m => <MatchCard key={m._id} m={m} teams={teams} />)}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )
                    })}
                </div>
            </div>

            {/* ── Mobile list ── */}
            <div className="sm:hidden">
                <MobileList matches={matches} teams={teams} />
            </div>
        </div>
    )
}
