import React from 'react';

export default function Fixtures() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-5xl font-claymore text-center my-8">
                Fixtures
            </h1>

            {/* Existing Table */}
            <div className="w-full aspect-video">
                <iframe
                    src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=America%2FNew_York&showPrint=0&showNav=0&showTitle=0&showCalendars=0&src=M2VhMmM1YTc4ODc0MWEzNzQzNmE5ZTM5MzhkNmE1YjA5OTI0MzU5MWE0MGI5ZWRhZWIyZDdjMmQwY2E4OWRmZEBncm91cC5jYWxlbmRhci5nb29nbGUuY29t&color=%23F6BF26"
                    width="1368" height="832">

                </iframe>
            </div>

            {/* Xplorer Rugby iframe */}
            <div className="w-full mt-8 aspect-video">
                <h2 className="text-5xl font-claymore text-center my-8">
                    Results
                </h2>
                <iframe
                    src="https://xplorer.rugby/central-florida-claymores/fixtures-results?team=Jo6LpEeeccjJ4yGwu&comp=All&season=All&tab=Results"
                    className="w-full h-full border-0"
                    title="Claymores Fixtures and Results"
                    loading="lazy"
                />
            </div>
        </div>
    );
}