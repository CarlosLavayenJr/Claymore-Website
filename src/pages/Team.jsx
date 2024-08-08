import React from 'react';
import './Team.css'; // Import the CSS file for styling

const rosterData = [
  { number: 1, name: 'Player 1', position: 'Forward', bio: 'Player 1 is a strong leader on and off the field.' },
  { number: 2, name: 'Player 2', position: 'Forward', bio: 'Player 2 has an exceptional ability to read the game.' },
  { number: 3, name: 'Player 3', position: 'Forward', bio: 'Player 3 is known for their speed and agility.' },
  { number: 4, name: 'Player 4', position: 'Forward', bio: 'Player 4 brings years of experience to the team.' },
  { number: 5, name: 'Player 5', position: 'Forward', bio: 'Player 5 is a powerhouse in the scrum.' },
  { number: 6, name: 'Player 6', position: 'Forward', bio: 'Player 6 is a versatile player who excels in multiple positions.' },
  { number: 7, name: 'Player 7', position: 'Forward', bio: 'Player 7 has an unstoppable drive on the field.' },
  { number: 8, name: 'Player 8', position: 'Forward', bio: 'Player 8 is a reliable player with great ball-handling skills.' },
  { number: 9, name: 'Player 9', position: 'Forward', bio: 'Player 9 is always ready to support their teammates.' },
  { number: 10, name: 'Player 10', position: 'Back', bio: 'Player 10 is a strategic thinker and key playmaker.' },
  { number: 11, name: 'Player 11', position: 'Back', bio: 'Player 11 is quick on their feet and a formidable opponent.' },
  { number: 12, name: 'Player 12', position: 'Back', bio: 'Player 12 is known for their precision and accuracy.' },
  { number: 13, name: 'Player 13', position: 'Back', bio: 'Player 13 brings energy and enthusiasm to every game.' },
  { number: 14, name: 'Player 14', position: 'Back', bio: 'Player 14 is a strategic defender and strong in tackles.' },
  { number: 15, name: 'Player 15', position: 'Back', bio: 'Player 15 has excellent kicking and passing skills.' },
  { number: 16, name: 'Player 16', position: 'Forward', bio: 'Player 16 is known for their endurance and strength.' },
  { number: 17, name: 'Player 17', position: 'Back', bio: 'Player 17 is a key player in offensive plays.' },
  { number: 18, name: 'Player 18', position: 'Forward', bio: 'Player 18 is relentless in their pursuit of the ball.' },
  { number: 19, name: 'Player 19', position: 'Back', bio: 'Player 19 excels in both defense and offense.' },
  { number: 20, name: 'Player 20', position: 'Forward', bio: 'Player 20 is a vital part of the team’s lineouts.' },
  { number: 21, name: 'Player 21', position: 'Back', bio: 'Player 21 is quick, agile, and always on the move.' },
  { number: 22, name: 'Player 22', position: 'Forward', bio: 'Player 22 is known for their powerful tackles.' },
  { number: 23, name: 'Player 23', position: 'Back', bio: 'Player 23 has a sharp eye for spotting opportunities.' },
  { number: 24, name: 'Player 24', position: 'Forward', bio: 'Player 24 is a key player in driving the team forward.' },
  { number: 25, name: 'Player 25', position: 'Back', bio: 'Player 25 is a strategic thinker and strong communicator.' },
  { number: 26, name: 'Player 26', position: 'Forward', bio: 'Player 26 is relentless in their pursuit of the ball.' },
  { number: 27, name: 'Player 27', position: 'Back', bio: 'Player 27 is a formidable defender with great vision.' },
  { number: 28, name: 'Player 28', position: 'Forward', bio: 'Player 28 is known for their ability to break through defenses.' },
  { number: 29, name: 'Player 29', position: 'Back', bio: 'Player 29 is a creative playmaker with great passing skills.' },
  { number: 30, name: 'Player 30', position: 'Forward', bio: 'Player 30 is a dedicated team player with strong leadership qualities.' },
];

const Team = () => {
  return (
    <div className="team-container">
      <h1>Meet the Team</h1>
      <p>
        Welcome to the Central Florida Claymores team page. Here you'll find information about our dedicated players and staff.
      </p>

      <h2>Team Roster</h2>
      <div className="roster-cards">
        {rosterData.map((player, index) => (
          <div className="player-card" key={index}>
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
