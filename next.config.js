/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'cdn.sanity.io',
            },
            {
                protocol: 'https',
                hostname: 'i.ytimg.com',
            },
        ],
    },
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
        ]
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
