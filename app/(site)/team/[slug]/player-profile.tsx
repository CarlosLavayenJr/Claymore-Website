import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type { SanityPlayer, SanityPlayerPhoto } from "@/sanity/lib/queries"
import PlayerGallery from "./PlayerGallery"

const DEFAULT_IMG = "https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png"
const LOGO_GHOST = "https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png"

export default function PlayerProfile({
    player,
    photos,
    nextPlayer,
}: {
    player: SanityPlayer
    photos: SanityPlayerPhoto[]
    nextPlayer: SanityPlayer | null
}) {
    return (
        <div className="min-h-screen bg-[#131518] text-white">

            {/* Hero */}
            <div className="relative overflow-hidden bg-[#131518] min-h-[80vh] flex items-end">

                {/* Faint blue horizontal band */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'linear-gradient(to bottom, transparent 20%, rgba(120,195,239,0.03) 45%, rgba(120,195,239,0.05) 55%, transparent 75%)',
                    }}
                />

                {/* Background ghost — huge logo, right-aligned */}
                <div className="absolute inset-0 flex items-end justify-end pointer-events-none overflow-hidden">
                    <img
                        src={LOGO_GHOST}
                        alt=""
                        aria-hidden="true"
                        className="select-none"
                        style={{ width: 'clamp(300px, 55vw, 700px)', opacity: 0.18, mixBlendMode: 'screen', transform: 'translate(12%, 20%)' }}
                    />
                </div>

                {/* Foreground ghost — smaller logo, sits just above the name */}
                <div
                    className="absolute left-8 md:left-16 pointer-events-none overflow-hidden"
                    style={{ bottom: '12rem', opacity: 0.07 }}
                >
                    <img
                        src={LOGO_GHOST}
                        alt=""
                        aria-hidden="true"
                        className="select-none"
                        style={{ width: 'clamp(80px, 14vw, 180px)', mixBlendMode: 'screen' }}
                    />
                </div>

                {/* Blue vertical accent bar */}
                <div
                    className="absolute left-0 top-0 w-1.5 h-1/2 md:h-full"
                    style={{ background: 'linear-gradient(to bottom, #78c3ef 70%, transparent 100%)' }}
                />

                {/* Player photo — right side, dual fade */}
                <div
                    className="absolute right-0 top-0 bottom-0 w-1/2 md:w-2/5"
                    style={{
                        maskImage: 'linear-gradient(to left, black 40%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to left, black 40%, transparent 100%)',
                    }}
                >
                    <img
                        src={player.imageUrl || DEFAULT_IMG}
                        alt={player.name}
                        className="w-full h-full object-cover object-top"
                        style={{
                            maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                        }}
                    />
                </div>

                {/* Text */}
                <div className="relative z-10 container mx-auto px-8 pb-20 pt-10">
                    <Link
                        href="/team"
                        className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm mb-12 w-fit"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Team
                    </Link>

                    <p className="text-[#78c3ef] text-xs font-bold uppercase tracking-[0.4em] mb-3">
                        {player.position}
                    </p>
                    <h1 className="text-5xl md:text-9xl font-claymore leading-none max-w-xl text-center md:text-left">
                        {player.name}
                    </h1>

                    {(player.height || player.weight) && (
                        <div className="flex gap-8 mt-8">
                            {player.height && (
                                <div>
                                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Height</p>
                                    <p className="text-2xl font-bold mt-1">{player.height}</p>
                                </div>
                            )}
                            {player.weight && (
                                <div>
                                    <p className="text-xs text-zinc-500 uppercase tracking-widest">Weight</p>
                                    <p className="text-2xl font-bold mt-1">{player.weight}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Bottom fade into body */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#131518] to-transparent" />
            </div>

            {/* Bio */}
            {player.description && (
                <div className="container mx-auto px-8 py-14 max-w-3xl border-l-2 border-[#78c3ef] ml-8 md:ml-auto">
                    <p className="text-zinc-300 leading-relaxed text-lg">{player.description}</p>
                </div>
            )}

            {/* Gallery */}
            {photos.length > 0 && (
                <PlayerGallery photos={photos} playerName={player.name} />
            )}

            {/* Next Player */}
            {nextPlayer && (
                <div className="border-t border-zinc-800">
                    <Link
                        href={`/team/${nextPlayer.slug}`}
                        className="group flex items-center justify-between px-8 py-10 hover:bg-zinc-900/50 transition-colors"
                    >
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-[0.3em] mb-2">Next Player</p>
                            <p className="text-3xl md:text-5xl font-claymore text-white group-hover:text-[#78c3ef] transition-colors">
                                {nextPlayer.name}
                            </p>
                            <p className="text-zinc-500 text-sm mt-1">{nextPlayer.position}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {nextPlayer.imageUrl && (
                                <img
                                    src={nextPlayer.imageUrl}
                                    alt={nextPlayer.name}
                                    className="w-16 h-20 object-cover object-top rounded opacity-60 group-hover:opacity-100 transition-opacity"
                                />
                            )}
                            <ArrowRight className="w-8 h-8 text-zinc-600 group-hover:text-[#78c3ef] transition-colors" />
                        </div>
                    </Link>
                </div>
            )}
        </div>
    )
}
