import React from 'react';

export default function Fixtures() {
    const fixtures = [
        {
            date: "2024-03-20",
            homeTeam: "Claymores RFC",
            awayTeam: "Opposition Team",
            time: "14:00",
            venue: "Home Ground",
            competition: "League"
        },
        // Add more fixtures as needed
    ];

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-6">Fixtures & Results</h1>
            <div className="overflow-x-auto">
                <table className="min-w-full bg-white">
                    <thead className="bg-gray-800 text-white">
                    <tr>
                        <th className="px-6 py-3 text-left">Date</th>
                        <th className="px-6 py-3 text-left">Home</th>
                        <th className="px-6 py-3 text-left">Away</th>
                        <th className="px-6 py-3 text-left">Time</th>
                        <th className="px-6 py-3 text-left">Venue</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                    {fixtures.map((fixture, index) => (
                        <tr key={index}>
                            <td className="px-6 py-4">{fixture.date}</td>
                            <td className="px-6 py-4">{fixture.homeTeam}</td>
                            <td className="px-6 py-4">{fixture.awayTeam}</td>
                            <td className="px-6 py-4">{fixture.time}</td>
                            <td className="px-6 py-4">{fixture.venue}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}