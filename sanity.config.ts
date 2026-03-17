import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { schema } from '@/sanity/schema'

export default defineConfig({
    name: 'claymore-website',
    title: process.env.NEXT_PUBLIC_SANITY_DATASET === 'development' ? 'Claymore Rugby [DEV]' : 'Claymore Rugby',
    basePath: '/studio',

    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,

    plugins: [structureTool(), visionTool(), media()],

    schema,
})
