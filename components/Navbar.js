'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FaBars, FaTimes } from 'react-icons/fa';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <nav className="bg-gray-800 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-xl font-bold">
              Claymores Rugby
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-4">
              <Link href="/" className="hover:bg-gray-700 px-3 py-2 rounded-md">
                Home
              </Link>
              <Link href="/about" className="hover:bg-gray-700 px-3 py-2 rounded-md">
                About
              </Link>
              <Link href="/teams" className="hover:bg-gray-700 px-3 py-2 rounded-md">
                Teams
              </Link>
              <Link href="/fixtures" className="hover:bg-gray-700 px-3 py-2 rounded-md">
                Fixtures
              </Link>
              <Link href="/contact" className="hover:bg-gray-700 px-3 py-2 rounded-md">
                Contact
              </Link>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md hover:bg-gray-700 focus:outline-none"
            >
              {isOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link href="/" className="block hover:bg-gray-700 px-3 py-2 rounded-md">
              Home
            </Link>
            <Link href="/about" className="block hover:bg-gray-700 px-3 py-2 rounded-md">
              About
            </Link>
            <Link href="/teams" className="block hover:bg-gray-700 px-3 py-2 rounded-md">
              Teams
            </Link>
            <Link href="/fixtures" className="block hover:bg-gray-700 px-3 py-2 rounded-md">
              Fixtures
            </Link>
            <Link href="/contact" className="block hover:bg-gray-700 px-3 py-2 rounded-md">
              Contact
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;