"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { SanityPlayer } from "@/sanity/lib/queries"

interface PlayerModalProps {
    player: SanityPlayer
    onClose: () => void
}

export default function PlayerModal({ player, onClose }: PlayerModalProps) {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md relative">
                <Button variant="ghost" size="icon" className="absolute right-2 top-2 z-10" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>

                <div className="aspect-video overflow-hidden rounded-t-2xl">
                    <img src={player.imageUrl || "https://cdn.sanity.io/images/bw1seoll/production/99bd3855af22a5c234bf0ac13dac921503f8eb96-594x1086.png"} alt={player.name} className="w-full h-[445px] object-contain" />
                </div>

                <CardHeader className="pb-2">
                    <h2 className="text-2xl font-bold">{player.name}</h2>
                    <div className="inline-block px-3 py-1 text-sm font-medium rounded-full bg-primary text-primary-foreground">
                        {player.position}
                    </div>
                </CardHeader>

                <CardContent>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div>
                            <p className="text-sm text-muted-foreground">Height</p>
                            <p className="font-medium">{player.height}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Weight</p>
                            <p className="font-medium">{player.weight}</p>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-2">Bio</h3>
                        <p className="text-muted-foreground">{player.description}</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
