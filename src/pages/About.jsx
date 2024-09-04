import React, { useState } from 'react';
import logo from '../assets/Claymores_Logo_Vertical_Final-2.png'; // Import the logo image
import coachImage from '../assets/coach.jpeg'; // Import the new coach image
import './About.css'; // Import the CSS file for styling

const About = () => {
  return (
    <div className="about-container">
      <div className="about-content">
        <h1>About Claymores Rugby</h1>
        <p>
          The Central Florida Claymores RFC began life in 2018 as the newest member to the Florida Rugby Union. The task at hand, to grow a competitive team built by players for players while simultaneously growing the historic sport of rugby.
        </p>
        <p>
          The Claymores began their inaugural season by winning their first match, and the coaches and players have not looked back since. The team has set their expectations to win a state title and advance as far nationally as their spirit and camaraderie will take them.
        </p>
        <p>
          Despite the struggles all have encountered during the COVID pandemic, the Claymores brotherhood has continued to grow in strength and experience at a rate that is electrifying. Every Wednesday the Claymores come together from all over the Orlando area to practice and build the foundation of a long-lasting, winning culture. On Saturday’s, the Claymores take the pitch to show that anything is possible with hard work, commitment, and heart.
        </p>

        <h1>About Our Coach</h1>
        <div className="coach-image">
          <img src={coachImage} alt="Coach Jamie Moncur" />
        </div>
        <p>
          Jamie Moncur started his playing career with 10 years of school boy rugby in Edinburgh Scotland at the well-established programs of Stewart’s Melville and Trinity Academy.
        </p>
        <p>
          During his time at Trinity, Jamie wore the #4 jersey for both his home team and the then known at that time, Lothian and Borders Select side.
        </p>
        <p>
          Before the emigration to USA, Jamie had a short spell building an introduction to rugby program for High Schools in The Netherlands. It was during this period that Jamie began to learn the thrills of coaching others.
        </p>
        <p>
          Once in America on a full-time basis, Jamie was back on the practice field for University of St. Thomas Celts RFC looking to develop the program to new heights.
        </p>
        <p>
          In the first full season under Coach Moncur, the Celts went on to secure record-breaking score lines against some of the best in Texas rugby.
        </p>
      </div>
      <div className="about-logo">
        <img src={logo} alt="Claymores Rugby Logo" />
      </div>
    </div>
  );
};

export default About;
