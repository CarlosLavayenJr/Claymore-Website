'use client'

import { useState } from 'react'
import PlayerCard from "@/components/player-card"
import PlayerCarousel from "@/components/player-carousel"
import type { SanityPlayer } from "@/sanity/lib/queries"

const FORWARD_KEYWORDS = ['prop', 'hooker', 'lock', 'flanker', 'number 8', 'no. 8', 'no.8', '8', 'forward']

function isForward(position: string) {
    const p = position.toLowerCase()
    return FORWARD_KEYWORDS.some((kw) => p.includes(kw))
}

function PlayerSection({ title, players, badgeColor }: { title: string; players: SanityPlayer[]; badgeColor?: string }) {
    if (players.length === 0) return null
    return (
        <div className="mb-14">
            <h2 className="text-3xl font-claymore mb-4 sm:mb-6">{title}</h2>
            {/* Mobile: free scroll carousel */}
            <div className="sm:hidden">
                <PlayerCarousel players={players} badgeColor={badgeColor} />
            </div>
            {/* Desktop: grid */}
            <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {players.map((player) => (
                    <PlayerCard key={player._id} player={player} />
                ))}
            </div>
        </div>
    )
}

export default function TeamGrid({ players }: { players: SanityPlayer[] }) {
    const [showActive, setShowActive] = useState(true)

    const filtered = players.filter((p) => showActive ? p.active !== false : p.active === false)
    const forwards = filtered.filter((p) => isForward(p.position))
    const backs = filtered.filter((p) => !isForward(p.position))

    return (
        <>
            {/* Toggle */}
            <div className="flex justify-center mb-10">
                <div className="flex rounded-full border border-zinc-700 overflow-hidden text-sm font-medium">
                    <button
                        onClick={() => setShowActive(true)}
                        className={`px-6 py-2 transition-colors ${showActive ? 'bg-[#78c3ef] text-black' : 'text-zinc-400 hover:text-white'}`}
                    >
                        Active
                    </button>
                    <button
                        onClick={() => setShowActive(false)}
                        className={`px-6 py-2 transition-colors ${!showActive ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                        Inactive
                    </button>
                </div>
            </div>

            <PlayerSection title="Forwards" players={forwards} badgeColor="#77c3ef" />
            <PlayerSection title="Backs" players={backs} badgeColor="#fd80b5" />

            {filtered.length === 0 && (
                <p className="text-center text-muted-foreground py-12">
                    No {showActive ? 'active' : 'inactive'} players found.
                </p>
            )}
        </>
    )
}
