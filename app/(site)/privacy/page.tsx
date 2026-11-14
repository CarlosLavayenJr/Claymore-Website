import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description:
        'How the Central Florida Claymores RFC, an Orlando rugby club, collects and uses information on claymoresrfc.com and in its club operations app.',
    alternates: { canonical: '/privacy' },
}

const sections = [
    {
        heading: 'Who we are',
        body: [
            'The Central Florida Claymores RFC is an amateur rugby club based in Orlando, Florida. This policy covers claymoresrfc.com and Claymores Clubhouse, the private app club volunteers use to run the club.',
        ],
    },
    {
        heading: 'What we collect on this website',
        body: [
            'Contact form: the name, email address, subject and message you send us. We use them only to reply to you and to follow up about playing, sponsoring or supporting the club.',
            'Spam protection: the contact form uses Cloudflare Turnstile, which checks that a submission comes from a person.',
            'Analytics: we use Vercel Analytics to count page views. It does not use cookies and does not identify individual visitors.',
            'We do not run advertising trackers and we do not sell personal information.',
        ],
    },
    {
        heading: 'Claymores Clubhouse and Google data',
        body: [
            'Claymores Clubhouse is used only by authorized club volunteers. When a volunteer connects a club Google account, the app reads club email threads from Gmail and search performance data from Google Search Console. If the volunteer turns on outreach, it can also send email from the club mailbox, such as field-rental inquiries.',
            'This data is stored on the volunteer’s own device, with sign-in credentials encrypted. It is used to review club email, track club goals and measure the website’s search performance.',
            'When the volunteer asks the app’s AI assistant for help, relevant excerpts, such as email summaries and search metrics, are sent to OpenAI to produce that answer. We do not sell Google user data, use it for advertising, or share it with anyone else.',
            'A volunteer can disconnect a Google account in the app at any time, which removes the saved credentials, and can revoke access from their Google Account permissions page.',
        ],
    },
    {
        heading: 'Who we share information with',
        body: [
            'Only the services that run the site and the club: Vercel (hosting and analytics), Resend (delivers contact form messages to our inbox), Cloudflare (spam protection), Sanity (content management), Google (email and search data) and OpenAI (AI assistance in Clubhouse).',
        ],
    },
    {
        heading: 'How long we keep it',
        body: [
            'Contact form messages stay in the club inbox for as long as they are useful for club business. Ask us and we will delete yours.',
        ],
    },
    {
        heading: 'Your choices',
        body: [
            'You can ask what information we hold about you, ask us to correct it, or ask us to delete it. Email claymoresrfc@gmail.com and a club volunteer will respond.',
        ],
    },
    {
        heading: 'Changes',
        body: ['If this policy changes, we will update this page and the date below.'],
    },
]

export default function PrivacyPage() {
    return (
        <div className="container mx-auto px-4 py-12 max-w-3xl">
            <h1 className="text-5xl font-claymore text-center mb-4">Privacy Policy</h1>
            <p className="text-center text-muted-foreground mb-12 text-lg">
                How Orlando&apos;s Central Florida Claymores RFC handles your information.
            </p>

            <div className="space-y-8">
                {sections.map((section) => (
                    <section key={section.heading} className="border-b pb-8 last:border-0">
                        <h2 className="text-xl font-bold mb-3">{section.heading}</h2>
                        <div className="space-y-3">
                            {section.body.map((paragraph) => (
                                <p key={paragraph} className="text-muted-foreground leading-relaxed">
                                    {paragraph}
                                </p>
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            <p className="mt-12 text-sm text-muted-foreground">
                Last updated November 14, 2026. Questions?{' '}
                <Link href="/contact" className="text-[#fd80b5] hover:underline">
                    Contact the club
                </Link>
                .
            </p>
        </div>
    )
}
