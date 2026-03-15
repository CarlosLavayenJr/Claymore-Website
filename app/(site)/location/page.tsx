import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'

export const metadata: Metadata = {
    title: 'Orlando Rugby Club Location — Where We Practice',
    description: 'Find the Central Florida Claymores RFC practice location in Orlando, FL. We train every Thursday evening, 8–10pm in the Orlando area. All skill levels welcome.',
    openGraph: {
        title: 'Orlando Rugby Club Location | Central Florida Claymores',
        description: 'Where the Central Florida Claymores RFC practice in Orlando, FL. Thursday evening, 8–10pms.',
        url: '/location',
    },
}

export default function LocationPage() {
    return (
        <div className="min-h-screen">
            <JsonLd data={organizationSchema} />

            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <h1 className="text-4xl md:text-5xl font-claymore text-center mb-4">
                    Find Us in Orlando
                </h1>
                <p className="text-center text-muted-foreground mb-12 text-lg">
                    The Central Florida Claymores RFC practice every Thursday, 8–10pm at Barnett Park — 4801 W Colonial Dr, Orlando, FL 32808.
                </p>

                <div className="grid md:grid-cols-2 gap-12 mb-16">
                    <div>
                        <h2 className="text-2xl font-claymore mb-6">Practice Details</h2>
                        <div className="space-y-4">
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Day & Time</p>
                                <p className="text-muted-foreground">Every Thursday, 8–10pm</p>
                            </div>
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Location</p>
                                <p className="text-muted-foreground">Barnett Park</p>
                                <p className="text-muted-foreground">4801 W Colonial Dr, Orlando, FL 32808</p>
                            </div>
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Contact</p>
                                <p className="text-muted-foreground">claymoresrfc@gmail.com</p>
                            </div>
                        </div>

                        <div className="mt-8 space-y-3">
                            <h3 className="text-lg font-bold">Getting There</h3>
                            <p className="text-muted-foreground">
                                We train at Barnett Park, 4801 W Colonial Dr, Orlando, FL 32808 — accessible from across Central Florida, whether you&apos;re coming from downtown Orlando, the UCF area, Lake Mary, Kissimmee, or the surrounding suburbs.
                            </p>
                            <p className="text-muted-foreground">
                                Free parking is available at Barnett Park. Practice runs every Thursday, 8–10pm.
                            </p>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-claymore mb-6">Orlando Area Map</h2>
                        {/* TODO: Replace src with embed URL pinned to your exact practice field */}
                        <div className="w-full h-80 rounded-xl overflow-hidden border">
                            <iframe
                                src="https://maps.google.com/maps?q=Barnett+Park,+4801+W+Colonial+Dr,+Orlando,+FL+32808&output=embed"
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                title="Central Florida Claymores RFC practice location — Barnett Park, Orlando, FL"
                            />
                        </div>
                    </div>
                </div>

                {/* About the area */}
                <section className="mb-16">
                    <h2 className="text-2xl font-claymore mb-4">Rugby in Central Florida</h2>
                    <p className="text-muted-foreground leading-relaxed mb-4">
                        The Central Florida Claymores RFC are Orlando&apos;s USA Rugby D3 club and one of the most active rugby programs in Central Florida. Founded in 2018, the club draws players from across the greater Orlando area — from the city proper out to the surrounding Central Florida suburbs.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                        Orlando&apos;s year-round warm weather makes it an ideal place to play rugby, and the Claymores take full advantage — training outdoors through the fall, winter, and spring competitive season. If you&apos;re anywhere in Central Florida and looking for a rugby club, the Claymores are your home.
                    </p>
                </section>

                <div className="text-center">
                    <Link
                        href="/join"
                        className="inline-block bg-[#77c3ef] text-white px-10 py-4 rounded-md font-semibold text-lg hover:opacity-90 transition-opacity"
                    >
                        Join the Claymores
                    </Link>
                </div>
            </div>
        </div>
    )
}
