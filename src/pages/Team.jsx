import React, { useState } from 'react';
import './Team.css'; // Import the CSS file for styling
import placeholderImage from '../assets/silhouette.jpg'; // Import the silhouette image

const rosterData = [
  { number: 1, name: 'Player 1', position: 'Forward', bio: 'Player 1 is a strong leader on and off the field.', image: placeholderImage },
  { number: 2, name: 'Player 2', position: 'Forward', bio: 'Player 2 has an exceptional ability to read the game.', image: placeholderImage },
  { number: 3, name: 'Player 3', position: 'Forward', bio: 'Player 3 is known for their speed and agility.', image: placeholderImage },
  { number: 4, name: 'Player 4', position: 'Forward', bio: 'Player 4 brings years of experience to the team.', image: placeholderImage },
  { number: 5, name: 'Player 5', position: 'Forward', bio: 'Player 5 is a powerhouse in the scrum.', image: placeholderImage },
  { number: 6, name: 'Player 6', position: 'Forward', bio: 'Player 6 is a versatile player who excels in multiple positions.', image: placeholderImage },
  { number: 7, name: 'Player 7', position: 'Forward', bio: 'Player 7 has an unstoppable drive on the field.', image: placeholderImage },
  { number: 8, name: 'Player 8', position: 'Forward', bio: 'Player 8 is a reliable player with great ball-handling skills.', image: placeholderImage },
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

const Team = ({ isAuthenticated }) => {
  const [roster, setRoster] = useState(rosterData);

  const handleInputChange = (index, field, value) => {
    const updatedRoster = [...roster];
    updatedRoster[index][field] = value;
    setRoster(updatedRoster);
  };

  const handleImageChange = (index, event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onloadend = () => {
      const updatedRoster = [...roster];
      updatedRoster[index].image = reader.result; // Store the image as a base64 string
      setRoster(updatedRoster);
    };

    if (file) {
      reader.readAsDataURL(file);
    }
  };

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
            {isAuthenticated && (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(index, e)}
                className="image-input"
              />
            )}
            <div className="player-number">{player.number}</div>
            {isAuthenticated ? (
              <input
                type="text"
                value={player.name}
                onChange={(e) => handleInputChange(index, 'name', e.target.value)}
                className="editable-input"
              />
            ) : (
              <div className="player-name">{player.name}</div>
            )}
            <div className="player-position">{player.position}</div>
            {isAuthenticated ? (
              <textarea
                value={player.bio}
                onChange={(e) => handleInputChange(index, 'bio', e.target.value)}
                className="editable-textarea"
              />
            ) : (
              <div className="player-bio">{player.bio}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Team;