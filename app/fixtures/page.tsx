import React from 'react';

export default function Fixtures() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-5xl font-claymore text-center my-8">
                Fixtures
            </h1>
            <div className="w-full aspect-video">
                <iframe
                    src="https://calendar.google.com/calendar/embed?src=centrolfloridaclaymores%40gmail.com&ctz=America%2FNew_York"
                    width="1368"
                    height="832"
                />
            </div>
            <div className="w-full mt-8 aspect-video">
                <h2 className="text-5xl font-claymore text-center my-8">
                    Results
                </h2>
                <iframe
                    src="https://xplorer.rugby/central-florida-claymores/"
                    className="w-full h-full border-0"
                    title="Claymores Fixtures and Results"
                    loading="lazy"
                />
            </div>
        </div>
    );
}
