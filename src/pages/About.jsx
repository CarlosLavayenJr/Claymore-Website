import React from 'react';
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
          The Claymores began their inaugural season by winning their first match, and the coaches and players have not looked back since. The team has set their expectations to win a state title and advance as far nationally as their spirit and camaraderie will take them
        </p>
        <p>
          Despite the struggles all have encountered during the COVID pandemic, the Claymores brotherhood has continued to grown in strength and experience at a rate that is electrifying. Every Wednesday the Claymores come together from all over the Orlando area to practice and build the foundation of a long lasting, winning culture. On Saturday’s, the Claymore’s take the pitch to show that anything is possible with hard work, commitment, and heart.
        </p>
        <h1>About Our Coach</h1>
        <div className="coach-image">
          <img src={coachImage} alt="Coach Jamie Moncur" />
        </div>
        <p>
          Jamie Moncur started his playing career with 10 years of school boy rugby in Edinburgh Scotland at the well established programs of Stewart’s Melville and Trinity Academy. 
        </p>
        <p>
          During his time at Trinity, Jamie wore the #4 jersey for both his home team and the then known at that time, Lothian and Borders Select side.
        </p>
        <p>
          Before the emigration to USA, Jamie had a short spell building an introduction to rugby program for High Schools in The Netherlands. It was during this period that Jamie began to learn the thrills of coaching others. 
        </p>
        <p>
          Once in America on a full time basis, Jamie was back on the practice field for University of St. Thomas Celts RFC looking to develop the program to new heights. Adopting a team that had not won in the previous 3 years meant time for an overhaul of systems and culture, and it happened quickly.
        </p>
        <p>
          In the first full season under Coach Moncur, the Celts went on to secure record breaking score lines against some of the best in Texas rugby. In 2009/2010 season the squad made it to the Texas State finals narrowly missing out 16-15 to the infamous Austin Huns but still earned the 2nd seed to represent Texas in the Westerns only to be knocked out, again narrowly, by the ultimate sweet 16 winners, St. Louis Royals.
        </p>
        <p>
          It was at that time Jamie’s off field professional career achieved new heights and it brought him to Orlando Florida at the end of this season. UST Celts went onward under new leadership and became the foundation of what is now known as Houston United Rugby Club (HURT). 
        </p>
        <p>
          Focusing solely on his profession, for the next few years, Jamie didn’t reappear in rugby until 2016 when he joined the Orlando Rugby team as Head Coach for 2 seasons. Both years he took the D2 side into the Florida Rugby playoffs with winning seasons that included a win over the then State Champions Miami Tridents.
        </p>
        <p>
          2018 and The Claymores were born, a brand new club founded by players for players in order to promote and maintain the essence of the game while searching for new talented individuals of all levels.
        </p>
        <p>
          Coach Moncur has completed various IRB rugby modules along with the USA Rugby L200 certification in coaching but he also continues to be a student of the game himself in order to help his team progress.
        </p>
        
      </div>
      <div className="about-logo">
        <img src={logo} alt="Claymores Rugby Logo" />
      </div>
    </div>
  );
};

export default About;
