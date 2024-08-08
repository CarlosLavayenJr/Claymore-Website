import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import './Header.css';

const Header = ({ isAuthenticated, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleNavbar = () => {
    setIsOpen(!isOpen);
  };

  return (
    <header className="header">
      <nav className="nav">
        <div className="nav-logo-container">
          <img src={logo} alt="Logo" className="nav-logo" />
        </div>
        <button className="nav-toggle" onClick={toggleNavbar}>
          &#9776;
        </button>
        <ul className={`nav-list ${isOpen ? 'nav-list-open' : ''}`}>
          <li className="nav-item"><Link to="/" onClick={toggleNavbar}>Home</Link></li>
          <li className="nav-item"><Link to="/about" onClick={toggleNavbar}>About</Link></li>
          <li className="nav-item"><Link to="/team" onClick={toggleNavbar}>Team</Link></li>
          <li className="nav-item"><Link to="/schedule" onClick={toggleNavbar}>Schedule</Link></li>
          <li className="nav-item"><Link to="/contact" onClick={toggleNavbar}>Contact</Link></li>
          {isAuthenticated ? (
            <li className="nav-item"><button className="auth-button" onClick={onLogout}>Logout</button></li>
          ) : (
            <li className="nav-item"><Link to="/login" className="auth-button" onClick={toggleNavbar}>Login</Link></li>
          )}
        </ul>
      </nav>
    </header>
  );
};

export default Header;
