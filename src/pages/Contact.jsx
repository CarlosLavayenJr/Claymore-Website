import React from 'react';
import { FaFacebook, FaInstagram, FaEnvelope } from 'react-icons/fa';
import contactImage from '../assets/state finals.jpg'; // Replace with the actual path to your image
import './Contact.css'; // Ensure your CSS file is linked properly

const Contact = () => {
  return (
    <div className="contact-container">
      <h1>Contact Us</h1>

      {/* Contact Image */}
      <div className="contact-image">
        <img src={contactImage} alt="Contact Us" />
      </div>

      {/* Contact Information */}
      <div className="contact-info">
        <p>You can reach us via the following platforms:</p>
        <div className="contact-icons">
          <a href="https://www.facebook.com/claymoresrugby" target="_blank" rel="noreferrer">
            <FaFacebook className="contact-icon" /> Facebook
          </a>
          <a href="https://www.instagram.com/claymoresrugby_/?hl=en" target="_blank" rel="noreferrer">
            <FaInstagram className="contact-icon" /> Instagram
          </a>
        </div>
      </div>
    </div>
  );
};

export default Contact;
