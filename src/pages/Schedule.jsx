import React, { useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './Schedule.css';

const localizer = momentLocalizer(moment);

const Schedule = ({ isAuthenticated }) => {
  const [events, setEvents] = useState([]);

  const handleSelectSlot = ({ start, end }) => {
    if (isAuthenticated) {
      const title = window.prompt('New Fixture Name');
      if (title) {
        setEvents([...events, { start, end, title }]);
      }
    } else {
      alert('You must be logged in to add fixtures.');
    }
  };

  return (
    <div className="schedule-container">
      <h1>Team Schedule</h1>
      <p>Check out the upcoming fixtures and events for the Central Florida Claymores.</p>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable={isAuthenticated}
        onSelectSlot={handleSelectSlot}
        style={{ height: 500, margin: '50px 0' }}
      />
    </div>
  );
};

export default Schedule;
