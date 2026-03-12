import { Card, CardContent } from "@/components/ui/card"
import type { Player } from "@/app/team/players"

interface PlayerCardProps {
    player: Player
    onClick: () => void
}

export default function PlayerCard({ player, onClick }: PlayerCardProps) {
    return (
        <Card
            className="overflow-hidden transition-all duration-300 hover:scale-105 cursor-pointer shadow-lg"
            onClick={onClick}
        >
            <div className="aspect-square overflow-hidden">
                <img
                    src={player.imageUrl || "/placeholder.svg"}
                    alt={player.name}
                    className="w-full h-full object-cover"
                />
            </div>
            <CardContent className="p-4">
                <h3 className="font-bold text-lg truncate">{player.name}</h3>
                <div className="mt-1 inline-block px-2 py-1 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                    {player.position}
                </div>
            </CardContent>
        </Card>
    )
}
