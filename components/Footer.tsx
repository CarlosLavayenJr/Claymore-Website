import Link from 'next/link'
import { FaFacebook, FaTwitter, FaInstagram } from 'react-icons/fa'

const Footer = () => {
    return (
        <footer className="bg-claymore-blue text-black font-semibold">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                        <h3 className="text-lg font-claymore mb-4">Contact Us</h3>
                        <p>Central Florida Claymores RFC</p>
                        <p>Orlando, FL</p>
                        <p>Email: claymoresrfc@gmail.com</p>
                    </div>

                    <div>
                        <h3 className="text-lg font-claymore mb-4">Quick Links</h3>
                        <ul className="space-y-2">
                            <li><Link href="/" className="hover:text-gray-300">Home</Link></li>
                            <li><Link href="/about" className="hover:text-gray-300">About</Link></li>
                            <li><Link href="/team" className="hover:text-gray-300">Team</Link></li>
                            <li><Link href="/fixtures" className="hover:text-gray-300">Fixtures</Link></li>
                            <li><Link href="/faq" className="hover:text-gray-300">FAQ</Link></li>
                            <li><Link href="/contact" className="hover:text-gray-300">Contact</Link></li>
                            <li><Link href="/join" className="hover:text-gray-300">Join Us</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-claymore">Follow Us</h3>
                        <div className="flex space-x-4">
                            <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">
                                <FaFacebook size={24} />
                            </a>
                            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">
                                <FaTwitter size={24} />
                            </a>
                            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300">
                                <FaInstagram size={24} />
                            </a>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-gray-700 text-center">
                    <p>&copy; {new Date().getFullYear()} Central Florida Claymores RFC. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}

export default Footer
