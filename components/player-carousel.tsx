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
                        className="shrink-0 w-[300px] rounded-xl overflow-hidden border border-[#EAEAEA] shadow-sm bg-white text-left"
                    >
                        <div className="aspect-square overflow-hidden">
                            <img
                                src={player.imageUrl || 'https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png'}
                                alt={player.name}
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <div className="p-3">
                            <p className="font-bold text-sm truncate text-[#111111]">{player.name}</p>
                            <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full text-white" style={{ backgroundColor: badgeColor }}>
                                {player.position}
                            </span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    )
}
