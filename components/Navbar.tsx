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

export const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false)

    const toggleMenu = () => setIsOpen(!isOpen)

    useEffect(() => {
        document.body.style.overflow = isOpen ? "hidden" : "unset"
    }, [isOpen])

    return (
        <>
            <nav className="bg-white shadow-2xl w-full fixed top-0 text-gray-700 z-30">
                <div className="px-4 sm:px-6 lg:px-32">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-shrink-0 mr-auto">
                            <Link href="/" className="flex items-center">
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
                            <NavLink href="/">Home</NavLink>
                            <NavLink href="/about">About</NavLink>
                            <NavLink href="/team">Team</NavLink>
                            <NavLink href="/fixtures">Fixtures</NavLink>
                            <NavLink href="/results">Results</NavLink>
                            <NavLink href="/faq">FAQ</NavLink>
                            <NavLink href="/contact">Contact</NavLink>
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
                                className="text-gray-700 hover:bg-gray-100 relative z-40"
                            >
                                <Menu className="h-6 w-6" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            {isOpen && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20" onClick={toggleMenu} aria-hidden="true" />
            )}

            {isOpen && (
                <div className="md:hidden fixed top-16 right-0 w-48 bg-white shadow-lg z-30">
                    <div className="py-1">
                        <Link href="/" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>Home</Link>
                        <Link href="/about" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>About</Link>
                        <Link href="/team" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>Team</Link>
                        <Link href="/fixtures" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>Fixtures</Link>
                        <Link href="/results" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>Results</Link>
                        <Link href="/faq" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>FAQ</Link>
                        <Link href="/contact" className="block text-gray-700 hover:bg-gray-700 px-4 py-2" onClick={toggleMenu}>Contact</Link>
                        <Link href="/join" className="block bg-[#77c3ef] text-white px-4 py-2 font-bold" onClick={toggleMenu}>Join Us</Link>
                    </div>
                </div>
            )}
        </>
    )
}

export default Navbar
