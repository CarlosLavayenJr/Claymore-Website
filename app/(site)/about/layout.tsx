import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'About Orlando Rugby | Central Florida Claymores RFC',
    description: 'The Central Florida Claymores RFC is an Orlando rugby club built by players, for players. USA Rugby D3, Florida Rugby Union member since 2018. Join us Thursdays.',
    alternates: { canonical: '/about' },
    openGraph: {
        title: 'About Orlando Rugby | Central Florida Claymores RFC',
        description: 'Orlando rugby club built by players, for players. USA Rugby D3 since 2018.',
        url: '/about',
    },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children
}
