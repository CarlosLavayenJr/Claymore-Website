import type { Metadata } from 'next'
import Link from 'next/link'
import { client } from '@/sanity/lib/client'
import { playersQuery } from '@/sanity/lib/queries'
import type { SanityPlayer } from '@/sanity/lib/queries'
import TeamGrid from '@/components/team-grid'

export const revalidate = 0

export const metadata: Metadata = {
    title: 'Orlando Rugby Players | Central Florida Claymores RFC Roster',
    description: "Meet the players of the Central Florida Claymores RFC — Orlando's USA Rugby D3 club. Forwards, backs, and everyone in between. Join us Thursdays.",
    alternates: { canonical: '/team' },
    openGraph: {
        title: 'Orlando Rugby Players | Central Florida Claymores RFC Roster',
        description: "Meet the forwards, backs, and staff of the Central Florida Claymores RFC — Orlando's USA Rugby D3 club.",
        url: '/team',
    },
}

export default async function TeamPage() {
    const players: SanityPlayer[] = await client.fetch(playersQuery)

    return (
        <div>
            {/* Hero — white */}
            <div className="bg-gradient-to-b from-[#f0f0f0] to-white py-16 md:py-24 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#fd80b5] mb-3">
                    Central Florida Claymores RFC
                </p>
                <h1 className="font-claymore text-[#111111] leading-none text-6xl md:text-8xl">
                    The Roster
                </h1>
                <div className="mx-auto mt-4 h-0.5 w-12 bg-[#fd80b5]" />
            </div>

            {/* Roster — dark */}
            <div className="relative overflow-x-hidden bg-[#111111]">
                {players.length === 0 ? (
                    <p className="text-center text-zinc-500 py-20">No players found. Add some in the Studio.</p>
                ) : (
                    <TeamGrid players={players} />
                )}
            </div>

            {/* CTA */}
            <div className="bg-white border-t border-[#EAEAEA] py-16 px-8 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.4em] text-[#fd80b5] mb-3">Join the Club</p>
                <h2 className="font-claymore text-[#111111] text-4xl md:text-5xl leading-none mb-4">
                    Ready to Play?
                </h2>
                <p className="text-[#555555] text-sm mb-8 max-w-sm mx-auto">
                    We practice every Thursday in Orlando. All skill levels welcome.
                </p>
                <Link
                    href="/join"
                    className="inline-block px-8 py-3 rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: '#fd80b5' }}
                >
                    Get Involved
                </Link>
            </div>
        </div>
    )
}
