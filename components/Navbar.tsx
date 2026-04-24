"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"

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

const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/team', label: 'Team' },
    { href: '/coaches', label: 'Coaches' },
    { href: '/fixtures', label: 'Fixtures' },
    { href: '/results', label: 'Results' },
    { href: '/blog', label: 'News' },
    { href: '/faq', label: 'FAQ' },
    { href: '/contact', label: 'Contact' },
]

export const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false)

    const toggleMenu = () => setIsOpen(!isOpen)
    const closeMenu = () => setIsOpen(false)

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : ""
        return () => { document.body.style.overflow = "" }
    }, [isOpen])

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
                            {navLinks.map(({ href, label }) => (
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

            {/* Mobile drawer — slides down below navbar */}
            <div
                className={`md:hidden fixed top-16 left-0 right-0 bottom-0 z-20 bg-white transition-opacity duration-200 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            >
                {/* Links */}
                <div className="flex flex-col items-center px-8 mt-4">
                    {navLinks.map(({ href, label }) => (
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

                {/* Join CTA */}
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
