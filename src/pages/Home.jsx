import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import bg1 from '../assets/bg1.jpg'; // Import images
import bg2 from '../assets/bg2.jpg';
import './Home.css'; // Import the CSS file for styling

const images = [bg1, bg2,];

const Home = () => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Change image every 5 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="home-container"
      style={{ backgroundImage: `url(${images[currentImageIndex]})` }}
    >
      <div className="text-box">
        <h1>Claymores Rugby</h1>
        <p>A Club Built for Players by Players.</p>
        <Link to="/about" className="read-more-link">Read More</Link>
      </div>
    </div>
  );
};

export default Home;
