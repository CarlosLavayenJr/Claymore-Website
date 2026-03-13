"use client"

import { useState } from "react"
import PlayerCard from "@/components/player-card"
import PlayerCarousel from "@/components/player-carousel"
import PlayerModal from "@/components/player-modal"
import type { SanityPlayer } from "@/sanity/lib/queries"

const FORWARD_KEYWORDS = ['prop', 'hooker', 'lock', 'flanker', 'number 8', 'no. 8', 'no.8', '8', 'forward']

function isForward(position: string) {
    const p = position.toLowerCase()
    return FORWARD_KEYWORDS.some((kw) => p.includes(kw))
}

function PlayerSection({ title, players, onSelect, badgeColor }: { title: string; players: SanityPlayer[]; onSelect: (p: SanityPlayer) => void; badgeColor?: string }) {
    if (players.length === 0) return null
    return (
        <div className="mb-14">
            <h2 className="text-3xl font-claymore mb-4 sm:mb-6">{title}</h2>
            {/* Mobile: free scroll carousel */}
            <div className="sm:hidden">
                <PlayerCarousel players={players} onSelect={onSelect} badgeColor={badgeColor} />
            </div>
            {/* Desktop: grid */}
            <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {players.map((player) => (
                    <PlayerCard key={player._id} player={player} onClick={() => onSelect(player)} />
                ))}
            </div>
        </div>
    )
}

export default function TeamGrid({ players }: { players: SanityPlayer[] }) {
    const [selectedPlayer, setSelectedPlayer] = useState<SanityPlayer | null>(null)

    const forwards = players.filter((p) => isForward(p.position))
    const backs = players.filter((p) => !isForward(p.position))

    return (
        <>
            <PlayerSection title="Forwards" players={forwards} onSelect={setSelectedPlayer} badgeColor="#77c3ef" />
            <PlayerSection title="Backs" players={backs} onSelect={setSelectedPlayer} badgeColor="#fd80b5" />
            {selectedPlayer && (
                <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
            )}
        </>
    )
}
