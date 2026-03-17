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
            <div className="sm:hidden">
                <PlayerCarousel players={players} badgeColor={badgeColor} />
            </div>
            <div className="hidden sm:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
                {players.map((player) => (
                    <PlayerCard key={player._id} player={player} />
                ))}
            </div>
        </div>
    )
}

export default function TeamGrid({ players }: { players: SanityPlayer[] }) {
    const active = players.filter((p) => p.active !== false)
    const forwards = active.filter((p) => isForward(p.position))
    const backs = active.filter((p) => !isForward(p.position))

    return (
        <>
            <PlayerSection title="Forwards" players={forwards} badgeColor="#77c3ef" />
            <PlayerSection title="Backs" players={backs} badgeColor="#fd80b5" />
        </>
    )
}
