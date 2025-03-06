export default function Team() {
    const teams = [
        {
            name: "Senior Men's First XV",
            description: "Our flagship team competing in [League Name]",
            training: "Tuesday and Thursday, 7-9pm",
        },
        {
            name: "Senior Women's XV",
            description: "Women's team competing in [League Name]",
            training: "Monday and Wednesday, 7-9pm",
        },
        // Add more teams as needed
    ];

    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-6">Our Teams</h1>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {teams.map((team, index) => (
                    <div key={index} className="bg-white shadow-lg rounded-lg p-6">
                        <h2 className="text-xl font-semibold mb-3">{team.name}</h2>
                        <p className="mb-2">{team.description}</p>
                        <p className="text-sm text-gray-600">
                            <strong>Training:</strong> {team.training}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}