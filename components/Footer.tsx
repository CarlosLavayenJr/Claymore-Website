import Link from 'next/link'
import Image from 'next/image'
import { FaFacebook, FaTwitter, FaInstagram } from 'react-icons/fa'

const Footer = () => {
    return (
        <footer className="bg-black text-gray-400">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

                    {/* Brand */}
                    <div className="flex flex-col gap-4">
                        <Image
                            src="/assets/logo.png"
                            alt="Central Florida Claymores RFC"
                            width={120}
                            height={40}
                            className="h-10 w-auto brightness-0 invert"
                        />
                        <p className="text-sm leading-relaxed">
                            Orlando&apos;s USA Rugby D3 club.<br />
                            Built by players, for players.
                        </p>
                        <p className="text-sm">
                            <a href="mailto:claymoresrfc@gmail.com" className="text-claymore-blue hover:text-white transition-colors">
                                claymoresrfc@gmail.com
                            </a>
                        </p>
                        <div className="flex gap-4 mt-1">
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-claymore-blue transition-colors">
                                <FaFacebook size={20} />
                            </a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-claymore-blue transition-colors">
                                <FaTwitter size={20} />
                            </a>
                            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-claymore-blue transition-colors">
                                <FaInstagram size={20} />
                            </a>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="text-white font-claymore text-lg mb-4">Quick Links</h3>
                        <ul className="space-y-2 text-sm">
                            {[
                                { href: '/', label: 'Home' },
                                { href: '/about', label: 'About' },
                                { href: '/team', label: 'Team' },
                                { href: '/fixtures', label: 'Fixtures' },
                                { href: '/faq', label: 'FAQ' },
                                { href: '/contact', label: 'Contact' },
                                { href: '/join', label: 'Join Us' },
                            ].map(({ href, label }) => (
                                <li key={href}>
                                    <Link href={href} className="hover:text-white transition-colors">
                                        {label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Join CTA */}
                    <div>
                        <h3 className="text-white font-claymore text-lg mb-4">Play Rugby in Orlando</h3>
                        <p className="text-sm leading-relaxed mb-4">
                            No experience needed. We practice every Wednesday in the Orlando area and welcome players of all skill levels.
                        </p>
                        <Link
                            href="/join"
                            className="inline-block bg-claymore-blue text-black font-bold text-sm px-5 py-2.5 rounded hover:bg-white transition-colors"
                        >
                            Join the Claymores
                        </Link>
                    </div>

                </div>

                <div className="mt-10 pt-6 border-t border-gray-800 text-center text-xs text-gray-600">
                    <p>&copy; {new Date().getFullYear()} Central Florida Claymores RFC. All rights reserved. Orlando, FL.</p>
                </div>
            </div>
        </footer>
    )
}

export default Footer
