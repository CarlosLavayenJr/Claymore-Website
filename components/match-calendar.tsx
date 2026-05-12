'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SanityMatch, SanityTeam, SanityPractice } from '@/sanity/lib/queries'
import { expandPractices, type PracticeInstance } from '@/lib/practices'
import {
    MatchCard,
    PracticeCard,
    findTeamLogo,
    isClaymores,
    getResult,
    RESULT_DOT as DOT,
} from '@/components/event-cards'

const MONTHS = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

// ── Mobile list view ─────────────────────────────────────────────────────────

function MobileList({
    matches,
    teams,
    practices,
}: {
    matches: SanityMatch[]
    teams: SanityTeam[]
    practices: SanityPractice[]
}) {
    const grouped = useMemo(() => {
        const latestSeason = matches.length > 0 ? Math.max(...matches.map(m => m.season)) : 0

        const upcomingMatches = matches.filter(m => m.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))
        const pastMatches = matches.filter(m => m.status !== 'upcoming' && m.season === latestSeason).sort((a, b) => b.date.localeCompare(a.date))

        const today = new Date()
        const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const horizon = new Date(today)
        horizon.setDate(horizon.getDate() + 60)
        const horizonIso = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, '0')}-${String(horizon.getDate()).padStart(2, '0')}`
        const upcomingPractices = expandPractices(practices, todayIso, horizonIso)

        const map = new Map<string, { matches: SanityMatch[]; practices: PracticeInstance[] }>()
        const ensure = (date: string) => {
            if (!map.has(date)) map.set(date, { matches: [], practices: [] })
            return map.get(date)!
        }
        for (const m of upcomingMatches) ensure(m.date).matches.push(m)
        for (const p of upcomingPractices) ensure(p.date).practices.push(p)

        const upcomingDates = Array.from(map.keys()).sort()

        const pastMap = new Map<string, SanityMatch[]>()
        for (const m of pastMatches) {
            if (!pastMap.has(m.date)) pastMap.set(m.date, [])
            pastMap.get(m.date)!.push(m)
        }
        const pastDates = Array.from(pastMap.keys()).sort((a, b) => b.localeCompare(a))

        return {
            upcoming: upcomingDates.map(d => [d, map.get(d)!] as const),
            past: pastDates.map(d => [d, { matches: pastMap.get(d)!, practices: [] as PracticeInstance[] }] as const),
        }
    }, [matches, practices])

    const formatDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    const sections = [...grouped.upcoming, ...grouped.past]

    return (
        <div className="divide-y divide-[#EAEAEA]">
            {sections.map(([date, bucket]) => (
                <div key={date} className="py-4">
                    <p className="text-xs uppercase tracking-widest text-[#555555] font-semibold mb-2">
                        {formatDate(date)}
                    </p>
                    <div className="flex flex-col gap-2">
                        {bucket.matches.map(m => <MatchCard key={m._id} m={m} teams={teams} />)}
                        {bucket.practices.map(p => <PracticeCard key={p.key} instance={p} />)}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ── Calendar grid view ───────────────────────────────────────────────────────────────────────────

export default function MatchCalendar({
    matches,
    teams,
    practices = [],
}: {
    matches: SanityMatch[]
    teams: SanityTeam[]
    practices?: SanityPractice[]
}) {
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

    const practicesByDate = useMemo(() => {
        const firstIso = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const lastDay = new Date(year, month + 1, 0).getDate()
        const lastIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        const instances = expandPractices(practices, firstIso, lastIso)
        const map = new Map<string, PracticeInstance[]>()
        for (const inst of instances) {
            if (!map.has(inst.date)) map.set(inst.date, [])
            map.get(inst.date)!.push(inst)
        }
        return map
    }, [practices, year, month])

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
                        const dayPractices = practicesByDate.get(isoDate) ?? []
                        const hasEvents = dayMatches.length > 0 || dayPractices.length > 0
                        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day

                        const cell = (
                            <div
                                className={`relative border-r border-b border-[#EAEAEA] h-28 overflow-hidden flex flex-col items-center pt-1.5 gap-1 transition-colors
                                    ${hasEvents ? 'bg-white hover:bg-[#77c3ef]/5 cursor-pointer' : 'bg-white cursor-default'}`}
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
                                    {dayPractices.map(inst => (
                                        inst.practice.iconUrl ? (
                                            <img
                                                key={inst.key}
                                                src={inst.practice.iconUrl}
                                                alt={inst.practice.iconAlt ?? inst.practice.title}
                                                className="w-9 h-9 object-contain shrink-0"
                                            />
                                        ) : (
                                            <span key={inst.key} className="w-1.5 h-1.5 rounded-full bg-[#fd80b5]" />
                                        )
                                    ))}
                                </div>
                            </div>
                        )

                        if (!hasEvents) return <div key={isoDate}>{cell}</div>

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
                                        {dayPractices.map(inst => <PracticeCard key={inst.key} instance={inst} />)}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        )
                    })}
                </div>
            </div>

            {/* ── Mobile list ── */}
            <div className="sm:hidden">
                <MobileList matches={matches} teams={teams} practices={practices} />
            </div>
        </div>
    )
}
