import { defineConfig } from 'sanity'
import { structureTool, type StructureResolver } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { media } from 'sanity-plugin-media'
import { schema } from '@/sanity/schema'

const SINGLETON_TYPES = new Set(['practiceSchedule', 'leagueChampionship'])

const structure: StructureResolver = (S) =>
    S.list()
        .title('Content')
        .items([
            S.listItem()
                .title('Practice Schedule')
                .id('practiceSchedule')
                .child(
                    S.document()
                        .schemaType('practiceSchedule')
                        .documentId('practiceSchedule')
                        .title('Practice Schedule'),
                ),
            S.listItem()
                .title('League Championship')
                .id('leagueChampionship')
                .child(
                    S.document()
                        .schemaType('leagueChampionship')
                        .documentId('leagueChampionship')
                        .title('League Championship'),
                ),
            S.divider(),
            ...S.documentTypeListItems().filter(
                (item) => !SINGLETON_TYPES.has(item.getId() ?? ''),
            ),
        ])

export default defineConfig({
    name: 'claymore-website',
    title: process.env.NEXT_PUBLIC_SANITY_DATASET === 'development' ? 'Claymore Rugby [DEV]' : 'Claymore Rugby',
    basePath: '/studio',

    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,

    plugins: [structureTool({ structure }), visionTool(), media()],

    schema,

    document: {
        actions: (input, context) =>
            SINGLETON_TYPES.has(context.schemaType)
                ? input.filter(({ action }) => action !== 'duplicate' && action !== 'delete')
                : input,
        newDocumentOptions: (prev, { creationContext }) =>
            creationContext.type === 'global'
                ? prev.filter((option) => !SINGLETON_TYPES.has(option.templateId))
                : prev,
    },
})
