import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'About Us',
    description: 'Learn the story of the Central Florida Claymores RFC — an Orlando rugby club built by players, for players. Founded in 2018 and growing ever since.',
    openGraph: {
        title: 'About Us | Central Florida Claymores RFC',
        description: 'An Orlando rugby club built by players, for players. Founded in 2018.',
        url: '/about',
    },
}

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children
}
