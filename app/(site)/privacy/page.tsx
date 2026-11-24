import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Privacy Policy',
    description:
        'How the Central Florida Claymores RFC, an Orlando rugby club, collects and uses information on claymoresrfc.com, in the Claymores RFC app, and in its club operations app.',
    alternates: { canonical: '/privacy' },
}

const sections = [
    {
        heading: 'Who we are',
        body: [
            'The Central Florida Claymores RFC is an amateur rugby club based in Orlando, Florida. This policy covers claymoresrfc.com, the Claymores RFC mobile app, the club’s member sign-in and dues pages, and Claymores Clubhouse, the private app club volunteers use to run the club.',
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
        heading: 'Member sign-in',
        body: [
            'Club members can sign in on this website and in the Claymores RFC app to see their dues and payments. Browsing the rest of the site and the app’s public content does not need an account.',
            'You can sign in with Google on the website or in the app, or with Sign in with Apple in the app. We receive your name, your email address and the account ID Google or Apple uses for you. If you choose to hide your email with Apple, we receive Apple’s private relay address instead of your own.',
            'We use this only to check that you are an invited club member and to know your role, such as player or club admin. We never receive your Google or Apple password.',
        ],
    },
    {
        heading: 'Requests to join',
        body: [
            'If you sign in but are not yet on the club’s member list, you can ask to join. We collect your name and email address, plus a phone number and a message if you choose to add them.',
            'Club admins review each request and approve or deny it. Requests are kept while they are waiting and, once decided, are kept as a record of the decision. To have yours deleted, email claymoresrfc@gmail.com.',
        ],
    },
    {
        heading: 'Dues and payments',
        body: [
            'The club keeps a record of the dues assigned to each member, the balance and the payments made, so members and club admins can see what is owed and what has been paid.',
            'Card payments are handled by Stripe on Stripe’s own secure checkout pages. Your card details go straight to Stripe and the club never sees or stores your card number. Stripe tells us the amount paid so we can update your balance.',
        ],
    },
    {
        heading: 'Cookies',
        body: [
            'The public website does not use cookies for analytics or advertising. Signing in adds only the cookies needed to keep you signed in, and no advertising or tracking cookies.',
            'Signed-in members: an encrypted session cookie that keeps you signed in for up to 30 days or until you sign out. It cannot be read by scripts on the page. While you sign in with Google, short-lived security cookies protect the sign-in from tampering.',
            'Requests to join: a short-lived encrypted cookie, lasting about 10 minutes, that remembers your Google confirmation while you fill in the request form.',
            'Navigation: a cookie named claymores_member that contains no personal information and only tells the menu to show “Account” instead of “Sign in”.',
            'A few club pages are served directly by the club’s member server, such as the dues admin page. Signing in there uses that server’s own session cookie, which also cannot be read by scripts and ends after eight hours.',
        ],
    },
    {
        heading: 'The Claymores RFC app',
        body: [
            'Fixtures, results, standings, practices and other public club content in the app need no account.',
            'If you sign in, the app keeps your sign-in token in your device’s secure storage, such as the iOS Keychain, so you stay signed in. Signing out removes it.',
            'If you turn on match or practice alerts, your device subscribes to those notification topics through Firebase Cloud Messaging, a Google service. The alerts are the same for everyone who subscribes and are not tied to your name or account. You can turn them off in the app or in your device settings.',
            'Availability you mark for upcoming fixtures in the app is saved only on your device.',
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
            'Only the services that run the site and the club: Vercel (website hosting and analytics), Render (hosts the club’s member server and database), Resend (delivers contact form messages to our inbox), Cloudflare (spam protection), Sanity (content management), Google (Google sign-in, email and search data, and app notifications through Firebase), Apple (Sign in with Apple), Stripe (card payments) and OpenAI (AI assistance in Clubhouse).',
        ],
    },
    {
        heading: 'How long we keep it',
        body: [
            'Contact form messages stay in the club inbox for as long as they are useful for club business. Ask us and we will delete yours.',
            'Member sign-in details are kept while you are a club member. Requests to join are kept as a record after they are approved or denied. Dues and payment records are kept as part of the club’s financial records.',
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
                Last updated November 24, 2026. Questions?{' '}
                <Link href="/contact" className="text-[#fd80b5] hover:underline">
                    Contact the club
                </Link>
                .
            </p>
        </div>
    )
}
