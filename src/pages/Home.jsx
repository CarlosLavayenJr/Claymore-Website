import React from 'react';
import { Link } from 'react-router-dom';
import bg1 from '../assets/bg1.jpg'; // Import a static image
import './Home.css'; // Import the CSS file for styling

const Home = () => {
  return (
    <div
      className="home-container"
      style={{ backgroundImage: `url(${bg1})` }} // Use a static image
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
