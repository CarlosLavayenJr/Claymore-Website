"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AnimatePresence, motion } from "framer-motion"

interface NavLinkProps {
    href: string
    children: React.ReactNode
}

const NavLink = ({ href, children }: NavLinkProps) => (
    <Link href={href} className="relative group px-3 py-2 text-gray-600 hover:text-white text-lg font-claymore">
        <span className="relative z-10">{children}</span>
        <span className="absolute inset-0 bg-claymore-blue transform -skew-x-12 origin-left scale-x-0 transition-transform group-hover:scale-x-100"></span>
    </Link>
)

const fixturesChildren = [
    { href: '/fixtures', label: 'Schedule' },
    { href: '/results', label: 'Results' },
    { href: '/opponents', label: 'Opponents' },
]

const navLinks = [
    { href: '/about', label: 'About' },
    { href: '/team', label: 'Team' },
    { href: '/blog', label: 'News' },
    { href: '/contact', label: 'Contact' },
]

export const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [fixturesOpen, setFixturesOpen] = useState(false)
    const [mobileFixturesOpen, setMobileFixturesOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const toggleMenu = () => setIsOpen(!isOpen)
    const closeMenu = () => { setIsOpen(false); setMobileFixturesOpen(false) }

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : ""
        return () => { document.body.style.overflow = "" }
    }, [isOpen])

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setFixturesOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <>
            <nav className="bg-white shadow-2xl w-full fixed top-0 text-gray-700 z-30">
                <div className="px-4 sm:px-6 lg:px-32">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-shrink-0 mr-auto">
                            <Link href="/" className="flex items-center" onClick={closeMenu}>
                                <Image
                                    src="/assets/logo.png"
                                    alt="Claymores Rugby Logo"
                                    width={150}
                                    height={40}
                                    className="h-10 w-auto"
                                    priority
                                />
                            </Link>
                        </div>

                        <div className="hidden md:flex items-center space-x-1">
                            {navLinks.slice(0, 2).map(({ href, label }) => (
                                <NavLink key={href} href={href}>{label}</NavLink>
                            ))}

                            {/* Fixtures dropdown */}
                            <div ref={dropdownRef} className="relative">
                                <button
                                    onClick={() => setFixturesOpen(o => !o)}
                                    className="relative group px-3 py-2 text-gray-600 hover:text-white text-lg font-claymore flex items-center gap-1"
                                >
                                    <span className="relative z-10">Fixtures</span>
                                    <ChevronDown className={`relative z-10 w-4 h-4 transition-transform ${fixturesOpen ? 'rotate-180' : ''}`} />
                                    <span className="absolute inset-0 bg-claymore-blue transform -skew-x-12 origin-left scale-x-0 transition-transform group-hover:scale-x-100"></span>
                                </button>
                                {fixturesOpen && (
                                    <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-[#EAEAEA] rounded-xl shadow-lg overflow-hidden z-50">
                                        {fixturesChildren.map(({ href, label }) => (
                                            <Link
                                                key={href}
                                                href={href}
                                                onClick={() => setFixturesOpen(false)}
                                                className="block px-4 py-2.5 text-sm font-claymore text-[#111111] hover:bg-[#77c3ef]/10 hover:text-[#77c3ef] transition-colors"
                                            >
                                                {label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {navLinks.slice(2).map(({ href, label }) => (
                                <NavLink key={href} href={href}>{label}</NavLink>
                            ))}

                            <Link href="/join" className="relative group px-3 py-2 text-white font-claymore text-lg">
                                <span className="relative z-10">Join Us</span>
                                <span className="absolute inset-0 bg-[#77c3ef] group-hover:bg-[#a0d5f5] transform -skew-x-12 transition-colors"></span>
                            </Link>
                        </div>

                        <div className="md:hidden">
                            <Button
                                onClick={toggleMenu}
                                variant="ghost"
                                size="icon"
                                className="text-gray-700 hover:bg-gray-100 relative z-50"
                            >
                                <Menu className="h-6 w-6" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Mobile drawer */}
            <div
                className={`md:hidden fixed top-16 left-0 right-0 bottom-0 z-20 bg-white transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            >
                <div className="flex flex-col items-center px-8 mt-4">
                    {navLinks.slice(0, 2).map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={closeMenu}
                            className="w-full text-center py-4 font-claymore text-3xl text-[#111111] hover:text-[#fd80b5] border-b border-[#EAEAEA] transition-colors"
                        >
                            {label}
                        </Link>
                    ))}

                    {/* Fixtures accordion */}
                    <button
                        onClick={() => setMobileFixturesOpen(o => !o)}
                        className="w-full text-center py-4 font-claymore text-3xl text-[#111111] hover:text-[#fd80b5] border-b border-[#EAEAEA] transition-colors flex items-center justify-center gap-2"
                    >
                        Fixtures
                        <motion.span animate={{ rotate: mobileFixturesOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
                            <ChevronDown className="w-5 h-5" />
                        </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                        {mobileFixturesOpen && (
                            <motion.div
                                key="fixtures-children"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeInOut' }}
                                className="overflow-hidden w-full"
                            >
                                {fixturesChildren.map(({ href, label }) => (
                                    <Link
                                        key={href}
                                        href={href}
                                        onClick={closeMenu}
                                        className="w-full text-center py-4 font-claymore text-3xl text-[#111111] hover:text-[#fd80b5] border-b border-[#EAEAEA]/60 transition-colors block bg-[#77c3ef]/5"
                                    >
                                        {label}
                                    </Link>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {navLinks.slice(2).map(({ href, label }) => (
                        <Link
                            key={href}
                            href={href}
                            onClick={closeMenu}
                            className="w-full text-center py-4 font-claymore text-3xl text-[#111111] hover:text-[#fd80b5] border-b border-[#EAEAEA] transition-colors"
                        >
                            {label}
                        </Link>
                    ))}
                </div>

                <div className="px-8 mt-8">
                    <Link
                        href="/join"
                        onClick={closeMenu}
                        className="block w-full text-center py-4 font-claymore text-2xl text-white rounded-md"
                        style={{ backgroundColor: '#fd80b5' }}
                    >
                        Join Us
                    </Link>
                </div>
            </div>
        </>
    )
}

export default Navbar
