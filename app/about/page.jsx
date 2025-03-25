export default function About() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl font-bold mb-6">About Claymores Rugby</h1>
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                    <h2 className="text-2xl font-semibold mb-4">Our History</h2>
                    <p className="mb-4">
                        [Your club history content here]
                    </p>
                    <h2 className="text-2xl font-semibold mb-4">Our Values</h2>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>Teamwork</li>
                        <li>Respect</li>
                        <li>Integrity</li>
                        <li>Excellence</li>
                    </ul>
                </div>
                <div>
                    {/* You can add an image here */}
                    <div className="bg-gray-200 h-80 rounded-lg">
                        [Club Image Placeholder]
                    </div>
                </div>
            </div>
        </div>
    );
}