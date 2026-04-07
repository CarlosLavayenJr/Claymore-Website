'use client'

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import type { SanityPlayer } from "@/sanity/lib/queries"

const FALLBACK_IMAGE = "https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png"

interface PlayerCardProps {
    player: SanityPlayer
    badgeColor?: string
    onClick?: () => void
    priority?: boolean
}

export default function PlayerCard({ player, badgeColor = '#77c3ef', onClick, priority = false }: PlayerCardProps) {
    const [loaded, setLoaded] = useState(false)

    const inner = (
        <div className="group relative overflow-hidden rounded-md aspect-[3/4] cursor-pointer bg-[#131518]">
            {/* Skeleton shimmer */}
            {!loaded && (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-[#1a1d20] via-[#252a2e] to-[#1a1d20] bg-[length:200%_100%]" />
            )}
            <Image
                src={player.imageUrl || FALLBACK_IMAGE}
                alt={player.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
                className={`object-cover object-top transition-all duration-500 group-hover:scale-105 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                priority={priority}
                onLoad={() => setLoaded(true)}
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
