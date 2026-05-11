'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SanityMatch, SanityTeam, SanityPractice } from '@/sanity/lib/queries'
import { expandPractices, type PracticeInstance } from '@/lib/practices'

const normalizeTeamName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function findTeam(name: string, teams: SanityTeam[]): SanityTeam | null {
    const n = normalizeTeamName(name)
    for (const team of teams) {
        const candidates = [team.name, ...(team.aliases ?? [])]
        if (candidates.some(alias => n.includes(normalizeTeamName(alias)) || normalizeTeamName(alias).includes(n))) {
            return team
        }
    }
    return null
}

function findTeamLogo(name: string, teams: SanityTeam[]): string | null {
    return findTeam(name, teams)?.logoUrl ?? null
}

function findTeamSlug(name: string, teams: SanityTeam[]): string | null {
    return findTeam(name, teams)?.slug ?? null
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

    const homeSlug = m.homeTeamSlug ?? findTeamSlug(m.homeTeam, teams)
    const awaySlug = m.awayTeamSlug ?? findTeamSlug(m.awayTeam, teams)
    const homeHref = isClaymores(m.homeTeam) ? '/team' : homeSlug ? `/opponents/${homeSlug}` : null
    const awayHref = isClaymores(m.awayTeam) ? '/team' : awaySlug ? `/opponents/${awaySlug}` : null

    const HomeTeam = () => (
        <div className="flex flex-col items-center gap-1 w-12 shrink-0">
            {homeLogo
                ? <img src={homeLogo} alt={m.homeTeam} className="w-8 h-8 object-contain" />
                : <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />}
            <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">{m.homeTeam}</p>
        </div>
    )
    const AwayTeam = () => (
        <div className="flex flex-col items-center gap-1 w-12 shrink-0">
            {awayLogo
                ? <img src={awayLogo} alt={m.awayTeam} className="w-8 h-8 object-contain" />
                : <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />}
            <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">{m.awayTeam}</p>
        </div>
    )

    return (
        <div className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[#EAEAEA] bg-white">
            {/* Home */}
            {homeHref
                ? <Link href={homeHref} className="hover:opacity-75 transition-opacity cursor-pointer"><HomeTeam /></Link>
                : <HomeTeam />}

            {/* Score / result */}
            <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {isPlayed ? (
                    <p className="font-mono text-base font-bold text-[#111111]">{m.homeScore} – {m.awayScore}</p>
                ) : (
                    <p className="text-xs font-semibold text-[#77c3ef] uppercase tracking-widest">vs {opponent}</p>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${PILL[result]}`}>
                    {RESULT_LABEL[result]}
                </span>
            </div>

            {/* Away */}
            {awayHref
                ? <Link href={awayHref} className="hover:opacity-75 transition-opacity cursor-pointer"><AwayTeam /></Link>
                : <AwayTeam />}
        </div>
    )
}

function AddressLink({ address }: { address: string }) {
    const q = encodeURIComponent(address)
    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${q}`
    const appleUrl = `https://maps.apple.com/?address=${q}`
    // Default to Google Maps for SSR + non-Apple platforms; swap to Apple Maps
    // after hydration when the visitor is on iOS / macOS so they land in their
    // native map app instead of a Google redirect.
    const [href, setHref] = useState(googleUrl)
    useEffect(() => {
        if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)) {
            setHref(appleUrl)
        }
    }, [appleUrl])
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#77c3ef] hover:underline"
        >
            {address}
        </a>
    )
}

function PracticeCard({ instance }: { instance: PracticeInstance }) {
    const { practice } = instance
    return (
        <div className="flex items-start gap-3 py-2 px-3 rounded-lg border border-[#EAEAEA] bg-white">
            {practice.iconUrl
                ? <img src={practice.iconUrl} alt={practice.iconAlt ?? practice.title} className="w-10 h-10 object-contain shrink-0" />
                : <div className="w-10 h-10 rounded-full bg-[#EAEAEA] shrink-0" />}
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#fd80b5]">Practice</p>
                <p className="text-sm font-semibold text-[#111111] leading-tight">{practice.title}</p>
                {practice.time && <p className="text-xs text-[#555555] mt-1">{practice.time}</p>}
                {practice.address && <AddressLink address={practice.address} />}
                {practice.description && (
                    <p className="text-xs text-[#555555] mt-1 whitespace-pre-line">{practice.description}</p>
                )}
            </div>
        </div>
    )
}

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

// ── Calendar grid view ────────────────────────────────────────────────────────

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
