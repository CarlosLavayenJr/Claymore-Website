/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'cdn.sanity.io',
            },
        ],
    },
    async redirects() {
        return [
            {
                source: '/results/:season(\\d{4})',
                destination: '/standings/:season',
                permanent: true,
            },
        ]
    },
}

module.exports = nextConfig
