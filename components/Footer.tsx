import Link from 'next/link'
import Image from 'next/image'
import { FaFacebook, FaTwitter, FaInstagram } from 'react-icons/fa'

const Footer = () => {
    return (
        <footer className="text-gray-400" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

                    {/* Brand */}
                    <div className="flex flex-col gap-4">
                        <Image
                            src="/assets/logo.png"
                            alt="Central Florida Claymores RFC"
                            width={150}
                            height={50}
                            className="w-[150px] h-auto brightness-0 invert"
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
                            <a href="https://www.facebook.com/claymoresrugby/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-claymore-blue transition-colors">
                                <FaFacebook size={20} />
                            </a>
                            <a href="https://www.instagram.com/claymoresrugby_/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-claymore-blue transition-colors">
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
                                { href: '/blog', label: 'News' },
                                { href: '/faq', label: 'FAQ' },
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
                            No experience needed. We practice every Thursday at Barnett Park in Orlando and welcome players of all skill levels.
                        </p>
                        <Link
                            href="/join"
                            className="inline-block bg-claymore-blue text-black font-bold text-sm px-5 py-1 rounded hover:bg-white transition-colors"
                        >
                            Join the Claymores
                        </Link>
                    </div>

                </div>

                <div className="mt-10 pt-6 border-t border-gray-700/50 text-center text-xs text-gray-600 space-y-1">
                    <p>Central Florida Claymores RFC — Barnett Park, 4801 W Colonial Dr, Orlando, FL 32808 — claymoresrfc@gmail.com</p>
                    <p>&copy; {new Date().getFullYear()} Central Florida Claymores RFC. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}

export default Footer
