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
            {
                source: '/shop',
                destination: 'https://tytanrugby.com/collections/claymores-rfc',
                permanent: true,
                basePath: false,
            },
        ]
    },
}

module.exports = nextConfig
