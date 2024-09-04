import React, { useState } from 'react';
import './Team.css'; // Import the CSS file for styling
import placeholderImage from '../assets/silhouette.jpg'; // Import the silhouette image

const rosterData = [
  { number: 1, name: 'Carlos Lavayen', position: 'Prop', bio: '5 year Claymore veteran hailing from Guyaquil, Ecuador.', image: placeholderImage },
  { number: 2, name: 'Alexander Cavanaugh', position: 'Fly-Half', bio: '5 year Claymore Veteran and club captain.', image: placeholderImage },
  { number: 3, name: 'Key Cooper', position: 'Scrum-half', bio: 'Hailing from England, you can count on key to be at every ruck.', image: placeholderImage },
  { number: 4, name: 'Freddy Rojas', position: 'Prop', bio: 'Bringing some Brazilian flair to the game, our wrecking ball that is Freddy.', image: placeholderImage },
  { number: 5, name: 'Tyler Cooper', position: 'Forward', bio: 'Few players can be considered a switch blade. But that nickname is right at home with Ty.', image: placeholderImage },
  { number: 6, name: 'Nabil Arabi El Eter', position: 'Center', bio: '.', image: placeholderImage },
  { number: 7, name: 'Darian Majia', position: 'Prop', bio: '5 yards from the try line? You know who its going to.', image: placeholderImage },
  { number: 8, name: 'Ben Story', position: 'Lock', bio: 'One minute hes on the field commanding the younger players to settle down and focus up. The next hes the reason everyone is crying of laughter at the bar. Ben brings Maturity and someone to lean on to the club.', image: placeholderImage },
  { number: 9, name: 'Player 9', position: 'Forward', bio: 'Player 9 is always ready to support their teammates.', image: placeholderImage },
  { number: 10, name: 'Player 10', position: 'Back', bio: 'Player 10 is a strategic thinker and key playmaker.', image: placeholderImage },
  { number: 11, name: 'Player 11', position: 'Back', bio: 'Player 11 is quick on their feet and a formidable opponent.', image: placeholderImage },
  { number: 12, name: 'Player 12', position: 'Back', bio: 'Player 12 is known for their precision and accuracy.', image: placeholderImage },
  { number: 13, name: 'Player 13', position: 'Back', bio: 'Player 13 brings energy and enthusiasm to every game.', image: placeholderImage },
  { number: 14, name: 'Player 14', position: 'Back', bio: 'Player 14 is a strategic defender and strong in tackles.', image: placeholderImage },
  { number: 15, name: 'Player 15', position: 'Back', bio: 'Player 15 has excellent kicking and passing skills.', image: placeholderImage },
  { number: 16, name: 'Player 16', position: 'Forward', bio: 'Player 16 is known for their endurance and strength.', image: placeholderImage },
  { number: 17, name: 'Player 17', position: 'Back', bio: 'Player 17 is a key player in offensive plays.', image: placeholderImage },
  { number: 18, name: 'Player 18', position: 'Forward', bio: 'Player 18 is relentless in their pursuit of the ball.', image: placeholderImage },
  { number: 19, name: 'Player 19', position: 'Back', bio: 'Player 19 excels in both defense and offense.', image: placeholderImage },
  { number: 20, name: 'Player 20', position: 'Forward', bio: 'Player 20 is a vital part of the team’s lineouts.', image: placeholderImage },
  { number: 21, name: 'Player 21', position: 'Back', bio: 'Player 21 is quick, agile, and always on the move.', image: placeholderImage },
  { number: 22, name: 'Player 22', position: 'Forward', bio: 'Player 22 is known for their powerful tackles.', image: placeholderImage },
  { number: 23, name: 'Player 23', position: 'Back', bio: 'Player 23 has a sharp eye for spotting opportunities.', image: placeholderImage },
  { number: 24, name: 'Player 24', position: 'Forward', bio: 'Player 24 is a key player in driving the team forward.', image: placeholderImage },
  { number: 25, name: 'Player 25', position: 'Back', bio: 'Player 25 is a strategic thinker and strong communicator.', image: placeholderImage },
  { number: 26, name: 'Player 26', position: 'Forward', bio: 'Player 26 is relentless in their pursuit of the ball.', image: placeholderImage },
  { number: 27, name: 'Player 27', position: 'Back', bio: 'Player 27 is a formidable defender with great vision.', image: placeholderImage },
  { number: 28, name: 'Player 28', position: 'Forward', bio: 'Player 28 is known for their ability to break through defenses.', image: placeholderImage },
  { number: 29, name: 'Player 29', position: 'Back', bio: 'Player 29 is a creative playmaker with great passing skills.', image: placeholderImage },
  { number: 30, name: 'Player 30', position: 'Forward', bio: 'Player 30 is a dedicated team player with strong leadership qualities.', image: placeholderImage },
];

const Team = () => {
  const [roster, setRoster] = useState(rosterData);

  return (
    <div className="team-container">
      <h1>Meet the Team</h1>
      <p>
        Welcome to the Central Florida Claymores team page. Here you'll find information about our dedicated players and staff.
      </p>

      <h2>Team Roster</h2>
      <div className="roster-cards">
        {roster.map((player, index) => (
          <div className="player-card" key={index}>
            <img src={player.image} alt={player.name} className="player-image" />
            <div className="player-number">{player.number}</div>
            <div className="player-name">{player.name}</div>
            <div className="player-position">{player.position}</div>
            <div className="player-bio">{player.bio}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default Team;