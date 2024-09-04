// src/App.js
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import About from './pages/About';
import Team from './pages/Team'; 
import Schedule from './pages/Schedule';
import Contact from './pages/Contact';
import './App.css'; 

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = (status) => {
    setIsAuthenticated(status);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  return (
    <Router>
      <div className="app-container">
        <Header isAuthenticated={isAuthenticated} onLogout={handleLogout} /> {/* Pass isAuthenticated and handleLogout */}
        <div className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About isAuthenticated={isAuthenticated} />} />
            <Route path="/team" element={<Team isAuthenticated={isAuthenticated} />} />
            <Route path="/schedule" element={<Schedule isAuthenticated={isAuthenticated} />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
};

export default App;
