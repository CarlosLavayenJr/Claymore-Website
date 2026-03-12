"use client"

import { useState } from "react"
import PlayerCard from "@/components/player-card"
import PlayerModal from "@/components/player-modal"
import type { SanityPlayer } from "@/sanity/lib/queries"

export default function TeamGrid({ players }: { players: SanityPlayer[] }) {
    const [selectedPlayer, setSelectedPlayer] = useState<SanityPlayer | null>(null)

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {players.map((player) => (
                    <PlayerCard
                        key={player._id}
                        player={player}
                        onClick={() => setSelectedPlayer(player)}
                    />
                ))}
            </div>
            {selectedPlayer && (
                <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
            )}
        </>
    )
}
