import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Contact Us | Central Florida Claymores',
    description: "Get in touch with the Central Florida Claymores RFC in Orlando, FL. Questions about joining rugby in Central Florida? We'd love to hear from you. Join us Wednesdays.",
    openGraph: {
        title: 'Contact Us | Central Florida Claymores | Orlando, FL',
        description: 'Contact Orlando\'s Central Florida Claymores RFC. Questions about joining rugby? Reach out.',
        url: '/contact',
    },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return children
}
