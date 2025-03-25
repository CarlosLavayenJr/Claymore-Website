import Link from 'next/link';
import { FaFacebook, FaTwitter, FaInstagram } from 'react-icons/fa';

const Footer = () => {
    return (
        <footer className="bg-claymore-blue text-black font-semibold">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Contact Info */}
                    <div>
                        <h3 className="text-lg font-claymore mb-4">Contact Us</h3>
                        <p>Claymores Rugby Club</p>
                        <p>123 Rugby Street</p>
                        <p>City, Country</p>
                        <p>Email: info@claymoresrugby.com</p>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="text-lg font-claymore mb-4">Quick Links</h3>
                        <ul className="space-y-2">
                            <li><Link href="/membership" className="hover:text-gray-300">Membership</Link></li>
                            <li><Link href="/news" className="hover:text-gray-300">News</Link></li>
                            <li><Link href="/shop" className="hover:text-gray-300">Club Shop</Link></li>
                            <li><Link href="/sponsors" className="hover:text-gray-300">Sponsors</Link></li>
                        </ul>
                    </div>

                    {/* Social Media */}
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
                    <p>&copy; {new Date().getFullYear()} Claymores Rugby Club. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;