'use client'

import { useState, useMemo } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { SanityMatch } from '@/sanity/lib/queries'

function normalizeTeamName(name: string): string {
    return name.replace(/ \(D[34]\)/g, '').replace(/ D[34]/g, '').replace('IR/', '')
}

function isClaymores(name: string): boolean {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

export default function MatchResultsTable({ matches }: { matches: SanityMatch[] }) {
    const [selectedOpponent, setSelectedOpponent] = useState('all')
    const [selectedSeason, setSelectedSeason] = useState('all')

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

        return { wins, losses, draws, pf, pa, diff: pf - pa, played: filtered.length - upcoming - cancelled, upcoming, cancelled }
    }, [filtered])

    const getRowClass = (m: SanityMatch) => {
        if (m.status === 'upcoming') return 'text-muted-foreground'
        if (m.status === 'cancelled') return 'text-muted-foreground italic'
        if (m.status === 'forfeit_us') return 'text-red-600 dark:text-red-400 italic'
        if (m.status === 'forfeit_them') return 'text-green-600 dark:text-green-400 italic'
        const weHome = isClaymores(m.homeTeam)
        const ours = weHome ? m.homeScore : m.awayScore
        const theirs = weHome ? m.awayScore : m.homeScore
        if (ours > theirs) return 'text-green-600 dark:text-green-400 font-bold'
        if (ours < theirs) return 'text-red-600 dark:text-red-400'
        return 'text-yellow-600 dark:text-yellow-400'
    }

    const getScore = (m: SanityMatch) => {
        if (m.status === 'upcoming') return <span className="text-muted-foreground">UPCOMING</span>
        if (m.status === 'cancelled') return <span className="italic">CANCELLED</span>
        if (m.status === 'forfeit_us') return <span className="italic">FORFEIT (us)</span>
        if (m.status === 'forfeit_them') return <span className="italic">FORFEIT (them)</span>
        return `${m.homeScore} – ${m.awayScore}`
    }

    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <span>Claymores Results</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Season" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Seasons</SelectItem>
                                {seasons.map((s) => (
                                    <SelectItem key={s} value={s.toString()}>{s} Season</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={selectedOpponent} onValueChange={setSelectedOpponent}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Opponent" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Opponents</SelectItem>
                                {opponents.map((o) => (
                                    <SelectItem key={o} value={o}>{o}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent>
                {/* Stats bar */}
                <div className="mb-6 p-4 bg-muted rounded-lg grid grid-cols-4 sm:grid-cols-8 gap-4 text-center">
                    {[
                        { label: 'Wins', value: stats.wins, color: 'text-green-600' },
                        { label: 'Losses', value: stats.losses, color: 'text-red-600' },
                        { label: 'Draws', value: stats.draws, color: 'text-yellow-600' },
                        { label: 'Played', value: stats.played, color: '' },
                        { label: 'PF', value: stats.pf, color: '' },
                        { label: 'PA', value: stats.pa, color: '' },
                        { label: '+/-', value: stats.diff, color: stats.diff >= 0 ? 'text-green-600' : 'text-red-600' },
                        { label: 'Upcoming', value: stats.upcoming, color: 'text-muted-foreground' },
                    ].map(({ label, value, color }) => (
                        <div key={label}>
                            <div className={`text-2xl font-bold ${color}`}>{value}</div>
                            <div className="text-xs text-muted-foreground">{label}</div>
                        </div>
                    ))}
                </div>

                {/* Table */}
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">Date</TableHead>
                                <TableHead>Home</TableHead>
                                <TableHead className="text-center">Score</TableHead>
                                <TableHead>Away</TableHead>
                                <TableHead className="text-right">Note</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No matches found</TableCell>
                                </TableRow>
                            ) : filtered.map((m) => (
                                <TableRow key={m._id} className={getRowClass(m)}>
                                    <TableCell className="font-medium">{formatDate(m.date)}</TableCell>
                                    <TableCell>{m.homeTeam}</TableCell>
                                    <TableCell className="text-center">{getScore(m)}</TableCell>
                                    <TableCell>{m.awayTeam}</TableCell>
                                    <TableCell className="text-right">
                                        {m.note && (
                                            <Badge variant="secondary" className="inline-flex gap-1 text-xs">
                                                <Info className="w-3 h-3" />
                                                {m.note}
                                            </Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
