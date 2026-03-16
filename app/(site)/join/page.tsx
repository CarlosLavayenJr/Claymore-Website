import type { Metadata } from 'next'
import Link from 'next/link'
import JsonLd from '@/components/json-ld'
import { organizationSchema } from '@/lib/schema'
import TeamPhotoStrip from '@/components/team-photo-strip'

export const metadata: Metadata = {
    title: 'Join a Rugby Club Near You in Orlando, FL — No Experience Needed',
    description: 'Searching for rugby near me in Orlando or Central Florida? Join the Claymores RFC — USA Rugby D3. No experience required. Practices every Thursday. All ages 18+ welcome.',
    alternates: { canonical: '/join' },
    openGraph: {
        title: 'Rugby Near Me in Orlando | Join the Central Florida Claymores',
        description: 'No experience needed. Practices every Thursday in Orlando. All skill levels welcome.',
        url: '/join',
    },
}

const joinFaqs = [
    {
        question: 'Do I need rugby experience to try out with the Orlando Claymores?',
        answer: 'Zero experience required. Many of our best players had never touched a rugby ball before joining. Our coaches will teach you everything you need to know.',
    },
    {
        question: 'What are rugby tryouts like in Orlando?',
        answer: "There's no formal tryout — just show up to a Thursday practice. We'll work with you on the basics and get you integrated into the team from day one.",
    },
    {
        question: 'How fit do I need to be to join Orlando rugby?',
        answer: "Whatever shape you're in, show up. Rugby has positions for every body type and fitness level. You'll get fitter as you go.",
    },
    {
        question: 'Can I join the Central Florida Claymores mid-season?',
        answer: 'Yes. We accept new players year-round. Come to a Thursday practice and we\'ll sort out the registration details from there.',
    },
    {
        question: 'What gear do I need to start playing rugby in Orlando?',
        answer: 'Just show up in athletic clothes and cleats if you have them. We\'ll sort out the rest. You\'ll need a mouthguard eventually, but not on day one.',
    },
]

const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: joinFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
}

export default function JoinPage() {
    return (
        <div className="min-h-screen">
            <JsonLd data={organizationSchema} />
            <JsonLd data={faqSchema} />

            {/* Hero */}
            <section className="bg-black text-white py-20 px-4 text-center">
                <div className="max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-claymore mb-6">
                        Join Orlando Rugby — No Experience Needed
                    </h1>
                    <p className="text-xl text-gray-300 mb-8">
                        The Central Florida Claymores RFC welcome players of all skill levels. Come to a Thursday practice in Orlando and see what rugby is all about.
                    </p>
                    <Link
                        href="/contact"
                        className="inline-block bg-[#77c3ef] text-white font-bold px-10 py-4 rounded-md text-lg hover:opacity-90 transition-opacity"
                    >
                        Get in Touch
                    </Link>
                </div>
            </section>

            <div className="container mx-auto px-4 py-16 max-w-4xl">

                {/* What to expect */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-8 text-center">What to Expect at Your First Practice</h2>
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            {
                                title: 'Show Up',
                                body: "Come to a Thursday evening, 8–10pm practice at our Orlando training ground. Wear athletic clothes and cleats if you have them — nothing else required.",
                            },
                            {
                                title: 'Learn the Basics',
                                body: "Our coaching staff will walk you through passing, tackling technique, and the fundamentals of rugby. No film to study, no tryout nerves — just show up and play.",
                            },
                            {
                                title: 'Join the Brotherhood',
                                body: "Rugby clubs are known for their culture. The Claymores are a tight-knit group of Orlando-area athletes who work hard on Saturday and celebrate together after.",
                            },
                        ].map((item, i) => (
                            <div key={i} className="bg-muted rounded-xl p-6">
                                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                                <p className="text-muted-foreground">{item.body}</p>
                            </div>
                        ))}
                    </div>
                </section>

            </div>

            <TeamPhotoStrip count={4} />

            <div className="container mx-auto px-4 py-16 max-w-4xl">

                {/* Practice schedule */}
                <section className="mb-16 bg-black text-white rounded-xl p-10 text-center">
                    <h2 className="text-3xl font-claymore mb-4">Practice Schedule</h2>
                    <p className="text-xl text-gray-300 mb-2">Every <strong className="text-white">Thursday Evening</strong></p>
                    <p className="text-gray-400 mb-6">Orlando, FL — <Link href="/location" className="text-[#77c3ef] hover:underline">view location</Link></p>
                    <p className="text-gray-300 max-w-xl mx-auto">
                        Matches are played on Saturdays during the Florida Rugby Union season. Check our <Link href="/fixtures" className="text-[#77c3ef] hover:underline">fixtures page</Link> for the full 2025 schedule.
                    </p>
                </section>

                {/* Who we're looking for */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-6 text-center">Who We&apos;re Looking For</h2>
                    <p className="text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-8">
                        The Central Florida Claymores RFC are a USA Rugby D3 club competing in the Florida Rugby Union. We&apos;re looking for athletes in the Orlando and Central Florida area who want to compete, grow, and be part of something bigger than themselves.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                        {['Complete beginners', 'Former high school or college athletes', 'Experienced rugby players new to Orlando', 'Anyone 18+ looking for a competitive team sport'].map((item, i) => (
                            <div key={i} className="flex items-center gap-3 bg-muted rounded-lg px-4 py-3">
                                <span className="text-green-600 font-bold text-xl">✓</span>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* FAQ */}
                <section className="mb-16">
                    <h2 className="text-3xl font-claymore mb-8 text-center">Common Questions</h2>
                    <div className="space-y-6">
                        {joinFaqs.map((faq, i) => (
                            <div key={i} className="border-b pb-6 last:border-0">
                                <h3 className="text-lg font-bold mb-2">{faq.question}</h3>
                                <p className="text-muted-foreground">{faq.answer}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Final CTA */}
                <section className="text-center">
                    <h2 className="text-3xl font-claymore mb-4">Ready to Play Rugby in Orlando?</h2>
                    <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                        Send us a message and we&apos;ll get back to you with everything you need to join the Central Florida Claymores RFC.
                    </p>
                    <Link
                        href="/contact"
                        className="inline-block bg-[#77c3ef] text-white px-10 py-4 rounded-md font-semibold text-lg hover:opacity-90 transition-opacity"
                    >
                        Contact the Claymores
                    </Link>
                </section>
            </div>
        </div>
    )
}
