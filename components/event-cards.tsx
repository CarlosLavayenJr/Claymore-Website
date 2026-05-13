'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { SanityMatch, SanityTeam } from '@/sanity/lib/queries'
import type { PracticeInstance } from '@/lib/practices'
import { matchSlug } from '@/lib/seo'
import MatchTypeBadge from '@/components/match-type-badge'

// ── Team / match helpers ────────────────────────────────────────────────────

export const normalizeTeamName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export function findTeam(name: string, teams: SanityTeam[]): SanityTeam | null {
    const n = normalizeTeamName(name)
    for (const team of teams) {
        const candidates = [team.name, ...(team.aliases ?? [])]
        if (
            candidates.some(
                (alias) =>
                    n.includes(normalizeTeamName(alias)) || normalizeTeamName(alias).includes(n),
            )
        ) {
            return team
        }
    }
    return null
}

export function findTeamLogo(name: string, teams: SanityTeam[]): string | null {
    return findTeam(name, teams)?.logoUrl ?? null
}

export function findTeamSlug(name: string, teams: SanityTeam[]): string | null {
    return findTeam(name, teams)?.slug ?? null
}

export function isClaymores(name: string) {
    return name.includes('Claymores') || name.includes('IR/Claymores')
}

export type Result = 'W' | 'L' | 'D' | 'upcoming' | 'cancelled'

export function getResult(m: SanityMatch): Result {
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

export const RESULT_DOT: Record<Result, string> = {
    W: 'bg-[#77c3ef]',
    L: 'bg-[#AAAAAA]',
    D: 'bg-[#fd80b5]',
    upcoming: 'bg-[#77c3ef]',
    cancelled: 'bg-[#EAEAEA]',
}

export const RESULT_PILL: Record<Result, string> = {
    W: 'bg-[#77c3ef] text-white',
    L: 'bg-[#EAEAEA] text-[#555555]',
    D: 'bg-[#fd80b5] text-white',
    upcoming: 'bg-[#77c3ef]/10 text-[#77c3ef] border border-[#77c3ef]/30',
    cancelled: 'bg-[#EAEAEA]/50 text-[#555555] border-[#EAEAEA]',
}

export const RESULT_LABEL: Record<Result, string> = {
    W: 'W',
    L: 'L',
    D: 'D',
    upcoming: 'Upcoming',
    cancelled: 'Cancelled',
}

// ── Shared cards ─────────────────────────────────────────────────────────────

/**
 * AddressLink — single hyperlink that opens Google Maps by default, switching
 * to Apple Maps after hydration when the visitor is on iOS or macOS so they
 * land in their native map app.
 */
export function AddressLink({ address }: { address: string }) {
    const q = encodeURIComponent(address)
    const googleUrl = `https://www.google.com/maps/search/?api=1&query=${q}`
    const appleUrl = `https://maps.apple.com/?address=${q}`
    const [href, setHref] = useState(googleUrl)
    useEffect(() => {
        if (
            typeof navigator !== 'undefined' &&
            /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent)
        ) {
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

export function MatchCard({ m, teams }: { m: SanityMatch; teams: SanityTeam[] }) {
    const result = getResult(m)
    const weHome = isClaymores(m.homeTeam)
    const opponent = weHome ? m.awayTeam : m.homeTeam
    const isPlayed = m.status !== 'upcoming' && m.status !== 'cancelled'
    const homeLogo = findTeamLogo(m.homeTeam, teams)
    const awayLogo = findTeamLogo(m.awayTeam, teams)

    return (
        <Link
            href={`/fixtures/${matchSlug(m)}`}
            className="flex items-center gap-3 py-2 px-3 rounded-lg border border-[#EAEAEA] bg-white hover:bg-[#F9F9F9] hover:border-[#77c3ef]/40 transition-colors cursor-pointer"
            aria-label={`View match details: ${m.homeTeam} vs ${m.awayTeam}`}
        >
            <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                {homeLogo ? (
                    <img src={homeLogo} alt={m.homeTeam} className="w-8 h-8 object-contain" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />
                )}
                <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">
                    {m.homeTeam}
                </p>
            </div>

            <div className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {isPlayed ? (
                    <p className="font-mono text-base font-bold text-[#111111]">
                        {m.homeScore} – {m.awayScore}
                    </p>
                ) : (
                    <p className="text-xs font-semibold text-[#77c3ef] uppercase tracking-widest">
                        vs {opponent}
                    </p>
                )}
                <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${RESULT_PILL[result]}`}>
                        {RESULT_LABEL[result]}
                    </span>
                    <MatchTypeBadge matchType={m.matchType} size="compact" />
                </div>
            </div>

            <div className="flex flex-col items-center gap-1 w-12 shrink-0">
                {awayLogo ? (
                    <img src={awayLogo} alt={m.awayTeam} className="w-8 h-8 object-contain" />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-[#EAEAEA]" />
                )}
                <p className="text-[9px] text-[#555555] text-center leading-tight truncate w-full">
                    {m.awayTeam}
                </p>
            </div>
        </Link>
    )
}

export function PracticeCard({ instance }: { instance: PracticeInstance }) {
    const { practice } = instance
    return (
        <div className="flex items-start gap-3 py-2 px-3 rounded-lg border border-[#EAEAEA] bg-white">
            {practice.iconUrl ? (
                <img
                    src={practice.iconUrl}
                    alt={practice.iconAlt ?? practice.title}
                    className="w-10 h-10 object-contain shrink-0"
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-[#EAEAEA] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#fd80b5]">Practice</p>
                <p className="text-sm font-semibold text-[#111111] leading-tight">{practice.title}</p>
                {practice.time && <p className="text-xs text-[#555555] mt-1">{practice.time}</p>}
                {practice.address && <AddressLink address={practice.address} />}
                {practice.description && (
                    <p className="text-xs text-[#555555] mt-1 whitespace-pre-line">
                        {practice.description}
                    </p>
                )}
            </div>
        </div>
    )
}
