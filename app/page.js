export default function Home() {
    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-4xl font-bold text-blue-600 mb-4">
                    Welcome to Claymore Rugby
                </h1>

                {/* Test Card */}
                <div className="bg-white shadow-lg rounded-lg p-6 hover:shadow-xl transition-shadow">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-3">
                        Style Test
                    </h2>
                    <p className="text-gray-600 mb-4">
                        This card should have:
                        - White background
                        - Shadow
                        - Rounded corners
                        - Padding
                    </p>
                    <button className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-md transition-colors">
                        Test Button
                    </button>
                </div>

                {/* Color Palette Demo */}
                <div className="grid grid-cols-4 gap-4 mt-8">
                    <div className="h-20 bg-blue-500 rounded-md flex items-center justify-center text-white">
                        Blue
                    </div>
                    <div className="h-20 bg-red-500 rounded-md flex items-center justify-center text-white">
                        Red
                    </div>
                    <div className="h-20 bg-green-500 rounded-md flex items-center justify-center text-white">
                        Green
                    </div>
                    <div className="h-20 bg-yellow-500 rounded-md flex items-center justify-center text-white">
                        Yellow
                    </div>
                </div>
            </div>
        </div>
    );
}