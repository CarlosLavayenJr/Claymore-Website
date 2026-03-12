export const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': ['SportsOrganization', 'LocalBusiness'],
    name: 'Central Florida Claymores Rugby Football Club',
    alternateName: ['Central Florida Claymores RFC', 'Orlando Claymores Rugby', 'CF Claymores'],
    url: 'https://claymoresrugby.com',
    logo: 'https://claymoresrugby.com/assets/logo.png',
    image: 'https://claymoresrugby.com/assets/logo.png',
    foundingDate: '2018',
    sport: 'Rugby Union',
    description: "Orlando's USA Rugby D3 club. The Central Florida Claymores RFC compete in the Florida Rugby Union and welcome players of all skill levels — no experience required.",
    address: {
        '@type': 'PostalAddress',
        addressLocality: 'Orlando',
        addressRegion: 'FL',
        addressCountry: 'US',
    },
    geo: {
        '@type': 'GeoCoordinates',
        latitude: 28.5383,
        longitude: -81.3792,
    },
    areaServed: [
        { '@type': 'City', name: 'Orlando' },
        { '@type': 'AdministrativeArea', name: 'Central Florida' },
    ],
    email: 'centrolfloridaclaymores@gmail.com',
    memberOf: [
        {
            '@type': 'SportsOrganization',
            name: 'Florida Rugby Union',
            url: 'https://rugbyfl.com',
        },
        {
            '@type': 'SportsOrganization',
            name: 'USA Rugby',
            url: 'https://usarugby.org',
        },
    ],
    // TODO: replace with real social profile URLs
    sameAs: [
        'https://www.facebook.com/CentralFloridaClaymores',
        'https://www.instagram.com/cfclaymores',
    ],
}
