import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'About Orlando Rugby | Central Florida Claymores RFC',
    description: 'The Central Florida Claymores RFC is an Orlando rugby club built by players, for players. Founded 2018 in D4, now competing in USA Rugby D3. Join us Thursdays.',
    alternates: { canonical: '/about' },
    openGraph: {
        title: 'About Orlando Rugby | Central Florida Claymores RFC',
        description: 'Orlando rugby club built by players, for players. Founded 2018, now USA Rugby D3.',
        url: '/about',
    },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children
}
