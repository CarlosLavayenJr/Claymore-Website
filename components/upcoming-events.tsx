'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { SanityMatch, SanityPractice, SanityTeam } from '@/sanity/lib/queries'
import { expandPractices, type PracticeInstance } from '@/lib/practices'
import { MatchCard, PracticeCard, isClaymores } from '@/components/event-cards'

interface UpcomingEventsProps {
    matches: SanityMatch[]
    practices: SanityPractice[]
    teams?: SanityTeam[]
    className?: string
}

type CalEvent =
    | { kind: 'match'; date: string; key: string; label: string; time?: string | null }
    | { kind: 'practice'; date: string; key: string; label: string; time?: string | null }

interface DayBucket {
    matches: SanityMatch[]
    practices: PracticeInstance[]
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export default function UpcomingEvents({
    matches,
    practices,
    teams = [],
    className = '',
}: UpcomingEventsProps) {
    const today = new Date()
    const [year, setYear] = useState(today.getFullYear())
    const [month, setMonth] = useState(today.getMonth())
    const [view, setView] = useState<'grid' | 'agenda'>('grid')

    function prev() {
        if (month === 0) { setMonth(11); setYear((y) => y - 1) }
        else setMonth((m) => m - 1)
    }
    function next() {
        if (month === 11) { setMonth(0); setYear((y) => y + 1) }
        else setMonth((m) => m + 1)
    }

    // Per-month bundle: raw matches + expanded practice instances, used both for
    // the agenda list and the grid view's day-cell popovers.
    const monthData = useMemo(() => {
        const firstIso = `${year}-${String(month + 1).padStart(2, '0')}-01`
        const lastDay = new Date(year, month + 1, 0).getDate()
        const lastIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
        // Include played + upcoming + cancelled — matches the fixtures calendar.
        // Filtering happens via month range; status is reflected in the popup card.
        const inMonth = matches.filter((m) => m.date >= firstIso && m.date <= lastIso)
        const instances = expandPractices(practices, firstIso, lastIso)

        const byDate = new Map<string, DayBucket>()
        const ensure = (date: string): DayBucket => {
            const existing = byDate.get(date)
            if (existing) return existing
            const fresh: DayBucket = { matches: [], practices: [] }
            byDate.set(date, fresh)
            return fresh
        }
        for (const m of inMonth) ensure(m.date).matches.push(m)
        for (const p of instances) ensure(p.date).practices.push(p)

        const evts: CalEvent[] = [
            ...inMonth.map<CalEvent>((m) => {
                const opp = isClaymores(m.homeTeam) ? m.awayTeam : m.homeTeam
                return { kind: 'match', date: m.date, key: `m-${m._id}`, label: `vs ${opp}`, time: m.kickoffTime }
            }),
            ...instances.map<CalEvent>((p) => ({
                kind: 'practice',
                date: p.date,
                key: p.key,
                label: p.practice.title,
                time: p.practice.time,
            })),
        ].sort((a, b) => a.date.localeCompare(b.date))

        return { byDate, monthEvents: evts }
    }, [matches, practices, year, month])

    const eventsByDate = useMemo(() => {
        const map = new Map<string, CalEvent[]>()
        for (const e of monthData.monthEvents) {
            if (!map.has(e.date)) map.set(e.date, [])
            map.get(e.date)!.push(e)
        }
        return map
    }, [monthData])

    return (
        <aside className={`border border-[#EAEAEA] rounded-xl bg-white aspect-square flex flex-col overflow-hidden shadow-sm ${className}`}>
            {/* Header: month nav + view toggle */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#fd80b5] text-white shrink-0">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={prev}
                        aria-label="Previous month"
                        className="p-1.5 rounded-md hover:bg-white/15 transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4 text-white" />
                    </button>
                    <h2 className="font-claymore text-lg text-white px-1 leading-none">
                        {MONTHS[month]} {year}
                    </h2>
                    <button
                        onClick={next}
                        aria-label="Next month"
                        className="p-1.5 rounded-md hover:bg-white/15 transition-colors"
                    >
                        <ChevronRight className="w-4 h-4 text-white" />
                    </button>
                </div>
                <div className="flex gap-1 relative">
                    <button
                        onClick={() => setView('grid')}
                        aria-label="Calendar view"
                        aria-pressed={view === 'grid'}
                        className={`relative p-1.5 rounded-md transition-colors ${
                            view === 'grid' ? 'text-white' : 'text-white/60 hover:text-white'
                        }`}
                    >
                        {view === 'grid' && (
                            <motion.span
                                layoutId="view-toggle-pill"
                                className="absolute inset-0 bg-white/25 rounded-md"
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            />
                        )}
                        <CalendarDays className="w-4 h-4 relative z-10" />
                    </button>
                    <button
                        onClick={() => setView('agenda')}
                        aria-label="Agenda view"
                        aria-pressed={view === 'agenda'}
                        className={`relative p-1.5 rounded-md transition-colors ${
                            view === 'agenda' ? 'text-white' : 'text-white/60 hover:text-white'
                        }`}
                    >
                        {view === 'agenda' && (
                            <motion.span
                                layoutId="view-toggle-pill"
                                className="absolute inset-0 bg-white/25 rounded-md"
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                            />
                        )}
                        <List className="w-4 h-4 relative z-10" />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 relative">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 6, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.985 }}
                        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                        className="absolute inset-0"
                    >
                        {view === 'grid' ? (
                            <GridView
                                year={year}
                                month={month}
                                eventsByDate={eventsByDate}
                                bucketsByDate={monthData.byDate}
                                teams={teams}
                                today={today}
                            />
                        ) : (
                            <AgendaView events={monthData.monthEvents} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-[#EAEAEA] text-right shrink-0">
                <Link
                    href="/fixtures"
                    className="text-xs font-semibold uppercase tracking-widest text-[#fd80b5] hover:underline"
                >
                    Full calendar →
                </Link>
            </div>
        </aside>
    )
}

function GridView({
    year,
    month,
    eventsByDate,
    bucketsByDate,
    teams,
    today,
}: {
    year: number
    month: number
    eventsByDate: Map<string, CalEvent[]>
    bucketsByDate: Map<string, DayBucket>
    teams: SanityTeam[]
    today: Date
}) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ]
    while (cells.length % 7 !== 0) cells.push(null)

    return (
        <div className="h-full flex flex-col p-2">
            <div className="grid grid-cols-7 mb-1">
                {DAY_LETTERS.map((d, i) => (
                    <div key={i} className="text-center text-[11px] uppercase tracking-widest text-[#AAA] py-1">
                        {d}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 flex-1 gap-px bg-[#F0F0F0] rounded">
                {cells.map((day, i) => {
                    if (day === null) {
                        return <div key={`empty-${i}`} className="bg-[#FAFAFA]" />
                    }
                    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const events = eventsByDate.get(iso) ?? []
                    const bucket = bucketsByDate.get(iso)
                    const hasEvents = events.length > 0
                    const isToday =
                        today.getFullYear() === year &&
                        today.getMonth() === month &&
                        today.getDate() === day

                    const cellContent = (
                        <div className="h-full w-full bg-white px-1 py-1 flex flex-col items-center justify-start gap-1 overflow-hidden">
                            <span
                                className={`text-xs font-medium leading-none flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                                    isToday ? 'bg-[#77c3ef] text-white' : 'text-[#111]'
                                }`}
                            >
                                {day}
                            </span>
                            {hasEvents && (
                                <div className="flex gap-0.5 flex-wrap justify-center">
                                    {events.slice(0, 3).map((e) => (
                                        <span
                                            key={e.key}
                                            className={`w-1.5 h-1.5 rounded-full ${
                                                e.kind === 'match' ? 'bg-[#fd80b5]' : 'bg-[#77c3ef]'
                                            }`}
                                            aria-label={e.label}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )

                    if (!hasEvents || !bucket) return <div key={iso}>{cellContent}</div>

                    return (
                        <Popover key={iso}>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="text-left h-full w-full cursor-pointer hover:bg-[#77c3ef]/5 transition-colors"
                                    aria-label={`Events on ${iso}`}
                                >
                                    {cellContent}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="center" className="w-72 p-3">
                                <p className="text-xs uppercase tracking-widest text-[#555] font-semibold mb-2">
                                    {new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        timeZone: 'UTC',
                                    })}
                                </p>
                                <div className="flex flex-col gap-2">
                                    {bucket.matches.map((m) => (
                                        <MatchCard key={m._id} m={m} teams={teams} />
                                    ))}
                                    {bucket.practices.map((inst) => (
                                        <PracticeCard key={inst.key} instance={inst} />
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                    )
                })}
            </div>
        </div>
    )
}

function AgendaView({ events }: { events: CalEvent[] }) {
    if (events.length === 0) {
        return (
            <div className="h-full flex items-center justify-center px-4">
                <p className="text-sm text-[#777] text-center">No events this month.</p>
            </div>
        )
    }
    return (
        <ul className="divide-y divide-[#EAEAEA] overflow-y-auto h-full">
            {events.map((e) => {
                const date = new Date(`${e.date}T00:00:00Z`)
                const day = date.getUTCDate()
                const mon = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()
                const wd = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()
                return (
                    <li key={e.key} className="px-4 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1">
                            {day} {mon}, {wd}
                        </p>
                        <div className="flex items-start gap-2">
                            <span
                                className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                    e.kind === 'match' ? 'bg-[#fd80b5]' : 'bg-[#77c3ef]'
                                }`}
                            />
                            <div className="min-w-0 flex-1">
                                {e.time && <p className="text-xs text-[#555]">{e.time}</p>}
                                <p className="text-sm font-semibold text-[#111] truncate">{e.label}</p>
                            </div>
                        </div>
                    </li>
                )
            })}
        </ul>
    )
}
