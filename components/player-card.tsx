import Link from "next/link"
import type { SanityPlayer } from "@/sanity/lib/queries"

interface PlayerCardProps {
    player: SanityPlayer
    badgeColor?: string
    onClick?: () => void
}

export default function PlayerCard({ player, badgeColor = '#77c3ef', onClick }: PlayerCardProps) {
    const inner = (
        <div className="group relative overflow-hidden rounded-md aspect-[3/4] cursor-pointer bg-[#131518]">
            <img
                src={player.imageUrl || "https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png"}
                alt={player.name}
                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            />
            {/* Bottom gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f1113] via-[#0f1113]/30 to-transparent" />
            {/* Text */}
            <div className="absolute bottom-0 left-0 right-0 p-3">
                <span
                    className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full text-white mb-1.5"
                    style={{ backgroundColor: badgeColor + '33', color: badgeColor, border: `1px solid ${badgeColor}55` }}
                >
                    {player.position}
                </span>
                <h3 className="font-claymore text-white text-lg leading-tight">{player.name}</h3>
            </div>
        </div>
    )

    if (player.slug) {
        return <Link href={`/team/${player.slug}`}>{inner}</Link>
    }

    return <div onClick={onClick}>{inner}</div>
}
