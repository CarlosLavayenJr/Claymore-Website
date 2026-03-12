import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Contact Us',
    description: 'Get in touch with the Central Florida Claymores RFC. Interested in joining Orlando rugby or have a question? We\'d love to hear from you.',
    openGraph: {
        title: 'Contact Us | Central Florida Claymores RFC',
        description: 'Interested in joining Orlando rugby? Get in touch with the Claymores.',
        url: '/contact',
    },
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return children
}
