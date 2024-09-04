import React, { useState } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import { Tooltip } from 'react-tooltip'; // Import Tooltip
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-tooltip/dist/react-tooltip.css'; // Import tooltip CSS
import './Schedule.css';

const localizer = momentLocalizer(moment);

const Schedule = () => {
  const [events, setEvents] = useState([
    { title: 'Sample Rugby Game with a Long Description', start: new Date(), end: new Date() }
  ]);

  // Function to add new events (fixtures)
  const handleSelectSlot = ({ start, end }) => {
    const title = window.prompt('New Fixture Name');
    if (title) {
      setEvents([...events, { title, start, end }]);
    }
  };

  // Function to delete an event when clicked
  const handleSelectEvent = (eventToDelete) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${eventToDelete.title}"?`);
    if (confirmDelete) {
      setEvents(events.filter(event => event !== eventToDelete));
    }
  };

  const EventComponent = ({ event }) => (
    <div>
      <span data-tooltip-id="event-tooltip" data-tooltip-content={event.title}>
        {event.title.length > 20 ? `${event.title.substring(0, 17)}...` : event.title}
      </span>
      <Tooltip id="event-tooltip" place="top" effect="solid" />
    </div>
  );

  return (
    <div className="schedule-container">
      <h1>Team Schedule</h1>
      <p>Check out the upcoming fixtures and events for the Central Florida Claymores.</p>
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        selectable
        onSelectSlot={handleSelectSlot} // Allow date editing by selecting slots
        onSelectEvent={handleSelectEvent} // Handle event deletion
        style={{ height: 500, margin: '50px 0' }}
        components={{
          event: EventComponent, // Use the custom event component
        }}
      />
    </div>
  );
};

export default Schedule;
