import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '2025 Fixtures & Schedule | Central Florida Claymores',
    description: '2025 match schedule, upcoming fixtures, and results for the Central Florida Claymores RFC. Follow Orlando rugby all season long. Go Claymores.',
    openGraph: {
        title: '2025 Fixtures & Schedule | Central Florida Claymores | Orlando, FL',
        description: '2025 fixtures and results for the Central Florida Claymores RFC — Orlando rugby.',
        url: '/fixtures',
    },
}

export default function Fixtures() {
    return (
        <div className="container mx-auto px-4 py-8">
            <h1 className="text-5xl font-claymore text-center my-8">
                2025 Fixtures & Results
            </h1>
            <p className="text-center text-muted-foreground mb-8">
                Central Florida Claymores RFC — Orlando, FL | Florida Rugby Union D3
            </p>
            <div className="w-full aspect-video">
                <iframe
                    src="https://calendar.google.com/calendar/embed?src=centrolfloridaclaymores%40gmail.com&ctz=America%2FNew_York"
                    width="1368"
                    height="832"
                    title="Central Florida Claymores RFC 2025 Match Schedule — Orlando Rugby"
                />
            </div>
            <div className="w-full mt-8 aspect-video">
                <h2 className="text-5xl font-claymore text-center my-8">
                    Results
                </h2>
                <iframe
                    src="https://xplorer.rugby/central-florida-claymores/"
                    className="w-full h-full border-0"
                    title="Central Florida Claymores RFC Match Results — Orlando Rugby"
                    loading="lazy"
                />
            </div>
        </div>
    )
}
