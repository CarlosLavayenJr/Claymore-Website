'use client';
import { useState } from 'react';

export default function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        // Add your form submission logic here
        console.log('Form data:', formData);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevState => ({
            ...prevState,
            [name]: value
        }));
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-6">Contact Us</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label htmlFor="name" className="block mb-2">Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-300 rounded"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="block mb-2">Email</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-300 rounded"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="subject" className="block mb-2">Subject</label>
                            <input
                                type="text"
                                id="subject"
                                name="subject"
                                value={formData.subject}
                                onChange={handleChange}
                                className="w-full p-2 border border-gray-300 rounded"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="message" className="block mb-2">Message</label>
                            <textarea
                                id="message"
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                rows="5"
                                className="w-full p-2 border border-gray-300 rounded"
                                required
                            ></textarea>
                        </div>
                        <button
                            type="submit"
                            className="bg-gray-800 text-white px-6 py-2 rounded hover:bg-gray-700"
                        >
                            Send Message
                        </button>
                    </form>
                </div>
                <div>
                    <div className="bg-gray-100 p-6 rounded-lg">
                        <h2 className="text-2xl font-semibold mb-4">Club Information</h2>
                        <div className="space-y-3">
                            <p><strong>Address:</strong><br />
                                Claymores Rugby Club<br />
                                123 Rugby Street<br />
                                City, Country</p>
                            <p><strong>Email:</strong> info@claymoresrugby.com</p>
                            <p><strong>Training Ground:</strong> [Your training ground location]</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}