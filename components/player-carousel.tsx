'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import type { SanityPlayer } from '@/sanity/lib/queries'

interface Props {
    players: SanityPlayer[]
    badgeColor?: string
}

export default function PlayerCarousel({ players, badgeColor = '#77c3ef' }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null)

    const items = [...players, ...players, ...players]

    useEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const cardWidth = el.scrollWidth / 3
        el.scrollLeft = cardWidth
    }, [])

    function handleScroll() {
        const el = scrollRef.current
        if (!el) return
        const setWidth = el.scrollWidth / 3
        if (el.scrollLeft < setWidth) {
            el.scrollLeft += setWidth
        } else if (el.scrollLeft >= setWidth * 2) {
            el.scrollLeft -= setWidth
        }
    }

    return (
        <div
            ref={scrollRef}
            className="overflow-x-auto scrollbar-hide -mx-4 px-4"
            onScroll={handleScroll}
        >
            <div className="flex gap-3 w-max pb-2">
                {items.map((player, i) => (
                    <Link
                        key={`${player._id}-${i}`}
                        href={player.slug ? `/team/${player.slug}` : '#'}
                        className="group shrink-0 w-[220px] rounded-xl overflow-hidden relative aspect-[3/4] bg-[#131518]"
                    >
                        <img
                            src={player.imageUrl || 'https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png'}
                            alt={player.name}
                            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1113] via-[#0f1113]/30 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                            <span
                                className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full mb-1.5"
                                style={{ backgroundColor: badgeColor + '33', color: badgeColor, border: `1px solid ${badgeColor}55` }}
                            >
                                {player.position}
                            </span>
                            <p className="font-claymore text-white text-lg leading-tight">{player.name}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
