import type { Metadata } from 'next'
import JsonLd from '@/components/json-ld'

export const metadata: Metadata = {
    title: 'Orlando Rugby FAQ — Joining the Claymores',
    description: 'FAQ about joining the Central Florida Claymores RFC in Orlando, FL. Practice schedule, costs, experience needed, USA Rugby D3 season info, and more. Join us Thursdays.',
    openGraph: {
        title: 'Orlando Rugby FAQ — Joining the Claymores | Central Florida Claymores',
        description: 'Everything you need to know about joining Orlando rugby with the Central Florida Claymores RFC.',
        url: '/faq',
    },
}

const faqs = [
    {
        question: 'How do I join the Central Florida Claymores?',
        answer: 'Getting started is easy — just show up to one of our Thursday evening, 8–10pm practices in Orlando. No experience necessary. You can also reach out via our contact page and we\'ll get back to you with all the details.',
    },
    {
        question: 'Do I need prior rugby experience to join?',
        answer: 'Absolutely not. The Claymores welcome players of all skill levels, from complete beginners to experienced players. Our coaching staff will get you up to speed quickly.',
    },
    {
        question: 'Where do the Claymores practice in Orlando?',
        answer: 'We practice in the Orlando area every Thursday evening, 8–10pm. Contact us for the current training location as it can vary by season.',
    },
    {
        question: 'When is the rugby season in Central Florida?',
        answer: 'The Claymores compete in the Florida Rugby Union. The main competitive season typically runs from fall through spring. Check our Fixtures page for the current schedule.',
    },
    {
        question: 'What division do the Claymores compete in?',
        answer: 'The Central Florida Claymores RFC compete in USA Rugby D3 through the Florida Rugby Union.',
    },
    {
        question: 'How much does it cost to join?',
        answer: 'There are membership dues that cover registration with the Florida Rugby Union and USA Rugby. Contact us directly for current pricing — we work hard to keep rugby accessible to everyone in the Orlando area.',
    },
    {
        question: 'What age do I need to be to play?',
        answer: 'Our senior men\'s team is open to players 18 and older. If you\'re under 18 and interested in rugby in Central Florida, reach out and we can point you in the right direction.',
    },
    {
        question: 'Where can I watch the Claymores play in Orlando?',
        answer: 'All home match locations and dates are listed on our Fixtures page. Matches are free to watch and we\'d love to have supporters on the sideline.',
    },
]

const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
        },
    })),
}

export default function FAQPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <JsonLd data={faqSchema} />
            <h1 className="text-5xl font-claymore text-center mb-4">FAQ</h1>
            <p className="text-center text-muted-foreground mb-12 text-lg">
                Everything you need to know about joining Orlando rugby with the Claymores.
            </p>

            <div className="space-y-8">
                {faqs.map((faq, index) => (
                    <div key={index} className="border-b pb-8 last:border-0">
                        <h2 className="text-xl font-bold mb-3">{faq.question}</h2>
                        <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                    </div>
                ))}
            </div>

            <div className="mt-16 text-center bg-muted rounded-xl p-8">
                <h2 className="text-2xl font-claymore mb-3">Still have questions?</h2>
                <p className="text-muted-foreground mb-6">We&apos;re happy to help. Reach out and someone from the club will get back to you.</p>
                <a
                    href="/join"
                    className="inline-block bg-[#77c3ef] text-white px-8 py-3 rounded-md hover:opacity-90 transition-opacity"
                >
                    Join the Claymores
                </a>
            </div>
        </div>
    )
}
