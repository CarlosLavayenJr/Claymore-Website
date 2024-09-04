import React from 'react';
import logo from '../assets/Claymores_Logo_Vertical_Final-2.png'; // Import the logo image
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

        <h2>2022 Season: A Breakthrough Year</h2>
        <p>
          The 2022 season marked a significant milestone in the club’s history. Competing in Division 4, the Claymores enjoyed a stellar season, advancing all the way to the <strong>State Final</strong>. Their journey to the final was marked by key victories, including a stunning <strong>95-0 win over the Orlando Otters</strong>, and hard-fought matches such as their <strong>30-28 victory over Orlando D4</strong> and their <strong>15-14 win over Tallahassee</strong>. These performances solidified their reputation as one of the most competitive teams in their division.
        </p>
        <p>
          Although the team narrowly missed out on the ultimate prize, the 2022 season was a testament to the team’s resilience and talent, and it set the stage for future success.
        </p>

        <h2>Looking Ahead: Division 3</h2>
        <p>
          The Central Florida Claymores are committed to building on the momentum of the 2022 season. With a roster full of experienced players, skilled newcomers, and dedicated coaches, the team continues to aim for success in both the state and national rugby scenes.
        </p>
        <p>
          Whether you're an experienced player or new to the sport, the Claymores invite everyone to join the brotherhood and be part of the club's exciting future. Together, we’re more than just a team—we’re a family on and off the field.
        </p>
      </div>
      <div className="about-logo">
        <img src={logo} alt="Claymores Rugby Logo" />
      </div>
    </div>
  );
};

export default About;
