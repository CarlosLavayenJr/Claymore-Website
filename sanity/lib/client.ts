import { createClient } from 'next-sanity'

export const client = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: '2024-01-01',
    // Server-only client. Pages are ISR/on-demand revalidated, so we fetch
    // rarely and want the freshest possible read when we do — the API CDN can
    // still be serving the pre-publish value at the moment a revalidation
    // webhook lands, which would bake stale content in for another hour.
    useCdn: false,
})
