// src/components/Footer.js
import React from 'react';
import './Footer.css'; // Import the CSS file for styling

const Footer = () => {
  return (
    <footer className="footer">
      <p>© 2024 Claymores Rugby Team. All rights reserved.</p>
      <ul className="footer-links">
        <li><a href="https://facebook.com">Facebook</a></li>
        <li><a href="https://twitter.com">Twitter</a></li>
        <li><a href="https://instagram.com">Instagram</a></li>
      </ul>
    </footer>
  );
};

export default Footer;
