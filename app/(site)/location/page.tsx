import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'

export const metadata: Metadata = {
    title: 'Orlando Rugby Club Location — Where We Practice',
    description: 'Find the Central Florida Claymores RFC practice location in Orlando, FL. We train every Wednesday evening in the Orlando area. All skill levels welcome.',
    openGraph: {
        title: 'Orlando Rugby Club Location | Central Florida Claymores',
        description: 'Where the Central Florida Claymores RFC practice in Orlando, FL. Wednesday evenings.',
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
                    The Central Florida Claymores RFC practice every Wednesday evening in the Orlando, FL area.
                </p>

                <div className="grid md:grid-cols-2 gap-12 mb-16">
                    <div>
                        <h2 className="text-2xl font-claymore mb-6">Practice Details</h2>
                        <div className="space-y-4">
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Day & Time</p>
                                <p className="text-muted-foreground">Every Wednesday Evening</p>
                            </div>
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Location</p>
                                {/* TODO: Replace with exact practice field address */}
                                <p className="text-muted-foreground">Orlando, FL</p>
                                <p className="text-sm text-muted-foreground mt-1">Contact us for the exact field location — it can vary by season.</p>
                            </div>
                            <div className="bg-muted rounded-lg p-4">
                                <p className="font-bold mb-1">Contact</p>
                                <p className="text-muted-foreground">centrolfloridaclaymores@gmail.com</p>
                            </div>
                        </div>

                        <div className="mt-8 space-y-3">
                            <h3 className="text-lg font-bold">Getting There</h3>
                            <p className="text-muted-foreground">
                                The Claymores train in the Orlando metro area, accessible from across Central Florida — whether you&apos;re coming from downtown Orlando, the UCF area, Lake Mary, Kissimmee, or the surrounding suburbs.
                            </p>
                            <p className="text-muted-foreground">
                                Free parking is available at the training ground. Contact us for the specific address for the current season.
                            </p>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-claymore mb-6">Orlando Area Map</h2>
                        {/* TODO: Replace src with embed URL pinned to your exact practice field */}
                        <div className="w-full h-80 rounded-xl overflow-hidden border">
                            <iframe
                                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d224543.51894826284!2d-81.50694!3d28.4810!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88e773d8fecdbc77%3A0xac3b2063ca5bf9e!2sOrlando%2C%20FL!5e0!3m2!1sen!2sus!4v1"
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                title="Central Florida Claymores RFC practice location — Orlando, FL"
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
                        className="inline-block bg-black text-white px-10 py-4 rounded-md font-semibold text-lg hover:bg-[#0066b2] transition-colors"
                    >
                        Join the Claymores
                    </Link>
                </div>
            </div>
        </div>
    )
}
