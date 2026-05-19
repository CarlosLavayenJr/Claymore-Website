import type { Metadata } from 'next'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
    title: 'Page Not Found | Central Florida Claymores RFC',
    description:
        "We couldn't find that page. Head back to the Central Florida Claymores RFC — Orlando's USA Rugby D3 club.",
    robots: { index: false, follow: false },
}

const quickLinks: { href: string; label: string; description: string }[] = [
    { href: '/', label: 'Home', description: 'Latest from the Claymores' },
    { href: '/fixtures', label: 'Schedule', description: 'Upcoming matches & practices' },
    { href: '/results', label: 'Results', description: 'Match-by-match history' },
    { href: '/standings', label: 'Standings', description: 'Florida Rugby Union league tables' },
    { href: '/team', label: 'Team', description: 'Meet the Claymores roster' },
    { href: '/contact', label: 'Contact', description: 'All skill levels welcome — get in touch' },
]

export default function NotFound() {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">
                <div className="container mx-auto px-4 py-20 max-w-3xl text-center">
                    <p className="text-xs uppercase tracking-widest text-[#fd80b5] font-semibold mb-3">
                        Central Florida Claymores RFC
                    </p>
                    <h1 className="text-7xl md:text-9xl font-claymore text-[#111111] leading-none mb-2">
                        404
                    </h1>
                    <p className="text-2xl md:text-3xl font-claymore text-[#111111] mb-3">
                        Knocked On.
                    </p>
                    <div className="w-12 h-px bg-[#fd80b5] mx-auto mb-6" />
                    <p className="text-[#555555] max-w-xl mx-auto mb-10">
                        We couldn&apos;t find the page you&apos;re looking for. It may have been moved,
                        renamed, or never existed. Pick yourself up and try one of the links below.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-left mb-10">
                        {quickLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className="block p-4 border border-[#EAEAEA] rounded-xl bg-white hover:border-[#77c3ef] transition-colors"
                            >
                                <p className="text-sm font-bold text-[#111111]">{link.label}</p>
                                <p className="text-xs text-[#555555] mt-1">{link.description}</p>
                            </Link>
                        ))}
                    </div>

                    <Link
                        href="/contact"
                        className="inline-block px-6 py-3 bg-[#77c3ef] text-white font-claymore text-lg rounded-md hover:bg-[#a0d5f5] transition-colors"
                    >
                        Join the Claymores
                    </Link>
                </div>
            </main>
            <Footer />
        </div>
    )
}
