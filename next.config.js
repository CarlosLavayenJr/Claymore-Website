/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async redirects() {
        return [
            {
                source: '/:path*',
                has: [{ type: 'host', value: 'claymoresrfc.com' }],
                destination: 'https://www.claymoresrfc.com/:path*',
                permanent: true,
            },
        ]
    },
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'cdn.sanity.io',
            },
        ],
    },
}

module.exports = nextConfig
