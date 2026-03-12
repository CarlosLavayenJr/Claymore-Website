"use client"

import { useState } from "react"
import PlayerCard from "@/components/player-card"
import PlayerModal from "@/components/player-modal"
import { playersData, type Player } from "@/app/team/players"

export default function TeamPage() {
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

    const openModal = (player: Player) => setSelectedPlayer(player)
    const closeModal = () => setSelectedPlayer(null)

    return (
        <main className="container mx-auto py-8 px-4">
            <h1 className="text-5xl font-bold mb-8 font-claymore text-center">Meet The Team</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {playersData.map((player) => (
                    <PlayerCard
                        key={player.id}
                        player={player}
                        onClick={() => openModal(player)}
                    />
                ))}
            </div>
            {selectedPlayer && (
                <PlayerModal player={selectedPlayer} onClose={closeModal} />
            )}
        </main>
    )
}
