import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'

export const metadata: Metadata = {
    title: 'Orlando Rugby — About the Central Florida Claymores RFC',
    description: 'The Central Florida Claymores RFC are Orlando\'s USA Rugby D3 club. Founded in 2018, 2023 state finalists, and growing. Learn about rugby in Orlando and Central Florida.',
    openGraph: {
        title: 'Orlando Rugby — About the Central Florida Claymores RFC',
        description: 'Founded 2018. 2023 state finalists. Orlando\'s USA Rugby D3 club.',
        url: '/about-orlando-rugby',
    },
}

export default function AboutOrlandoRugbyPage() {
    return (
        <div className="min-h-screen">
            <JsonLd data={organizationSchema} />

            <div className="container mx-auto px-4 py-12 max-w-4xl">
                <h1 className="text-4xl md:text-5xl font-claymore text-center mb-4">
                    Orlando Rugby — The Central Florida Claymores RFC
                </h1>
                <p className="text-center text-muted-foreground text-lg mb-16">
                    Founded 2018 · USA Rugby D3 · Florida Rugby Union · Orlando, FL
                </p>

                {/* Who we are */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-6">Who We Are</h2>
                    <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                        The Central Florida Claymores RFC are Orlando&apos;s USA Rugby D3 club, competing in the Florida Rugby Union since 2018. Founded with a simple mission — build a competitive rugby program in Central Florida, by players, for players — the Claymores have grown from a handful of founding members into one of the most active rugby clubs in Orlando.
                    </p>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        We train every Thursday evening, 8–10pm in the Orlando area and compete on Saturdays during the Florida Rugby Union season. The club is open to players of all backgrounds and skill levels, and our coaching staff is committed to developing players at every stage of their rugby journey.
                    </p>
                </section>

                {/* D3 context */}
                <section className="mb-16 bg-black text-white rounded-xl p-10">
                    <h2 className="text-3xl font-claymore mb-6">USA Rugby D3 — What That Means</h2>
                    <p className="text-gray-300 leading-relaxed mb-4">
                        USA Rugby divides men&apos;s club rugby into competitive divisions nationally. Division 3 (D3) is a serious level of play — organized through territorial unions like the Florida Rugby Union — where clubs compete for state titles and the chance to advance in national competition.
                    </p>
                    <p className="text-gray-300 leading-relaxed mb-4">
                        The Central Florida Claymores RFC reached the D3 state final in 2023, establishing themselves as one of the premier rugby clubs in the Florida Rugby Union. The club&apos;s trajectory — from founding in 2018 to state finalists in five years — reflects both the quality of the players and the strength of the Central Florida rugby community.
                    </p>
                    <p className="text-gray-300 leading-relaxed">
                        The goal is a state championship. The Claymores are building toward it every Thursday in Orlando.
                    </p>
                </section>

                {/* What makes Claymores different */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-6">What Makes the Claymores Different</h2>
                    <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                        Orlando has rugby history. But the Claymores represent something specific: a club that is entirely player-led, with coaches who came up through the same ranks and a culture that prioritizes brotherhood as much as winning.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-6 mt-8">
                        {[
                            {
                                title: 'Player-built culture',
                                body: 'Founded and run by players who love rugby. There\'s no ego in the setup — everyone earns their spot.',
                            },
                            {
                                title: 'Genuine development',
                                body: 'Our coaching staff develops players from the ground up. Beginners become contributors. Contributors become leaders.',
                            },
                            {
                                title: 'Central Florida roots',
                                body: 'We\'re an Orlando club. Our players live, work, and go to school across Central Florida. This is home.',
                            },
                            {
                                title: 'Competitive trajectory',
                                body: 'State finalists in 2023. The Claymores compete to win — and the program is still growing.',
                            },
                        ].map((item, i) => (
                            <div key={i} className="border rounded-xl p-6">
                                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                                <p className="text-muted-foreground">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Orlando rugby landscape */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-6">Rugby in Orlando, FL</h2>
                    <p className="text-lg text-muted-foreground leading-relaxed mb-4">
                        Orlando and the broader Central Florida region have a growing rugby community. The Florida Rugby Union oversees competition across the state, with clubs competing from Tallahassee to Miami. Within Central Florida, the Claymores are the D3 option for serious adult club rugby — with year-round training taking advantage of Orlando&apos;s climate and growing player pool.
                    </p>
                    <p className="text-lg text-muted-foreground leading-relaxed">
                        If you&apos;ve moved to Orlando, played rugby elsewhere, or are looking to start for the first time — the Claymores are Central Florida&apos;s club. Come to a Thursday practice and find out what Orlando rugby looks like.
                    </p>
                </section>

                <div className="text-center">
                    <Link
                        href="/join"
                        className="inline-block bg-[#77c3ef] text-white px-10 py-4 rounded-md font-semibold text-lg hover:opacity-90 transition-opacity mr-4"
                    >
                        Join the Claymores
                    </Link>
                    <Link
                        href="/about"
                        className="inline-block border border-[#77c3ef] text-[#77c3ef] px-10 py-4 rounded-md font-semibold text-lg hover:bg-[#77c3ef]/10 transition-colors"
                    >
                        Club History
                    </Link>
                </div>
            </div>
        </div>
    )
}
