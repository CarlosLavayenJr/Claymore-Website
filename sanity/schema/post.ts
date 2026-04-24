import { defineField, defineType } from 'sanity'

export const post = defineType({
    name: 'post',
    title: 'News Post',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: { source: 'title' },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'publishedAt',
            title: 'Published At',
            type: 'datetime',
        }),
        defineField({
            name: 'coverImage',
            title: 'Cover Image',
            type: 'image',
            options: { hotspot: true },
            fields: [
                defineField({
                    name: 'alt',
                    title: 'Alt text',
                    type: 'string',
                    description: 'Describe the image. Falls back to the post title when empty.',
                }),
            ],
        }),
        defineField({
            name: 'excerpt',
            title: 'Excerpt',
            type: 'text',
            rows: 3,
        }),
        defineField({
            name: 'body',
            title: 'Body',
            type: 'array',
            of: [{ type: 'block' }, { type: 'image' }],
        }),
        defineField({
            name: 'mediaTag',
            title: 'Gallery Tag',
            type: 'reference',
            to: [{ type: 'media.tag' }],
            options: { disableNew: true },
            description: 'Photos with this tag will appear in a gallery at the bottom of the post.',
        }),
    ],
    preview: {
        select: {
            title: 'title',
            subtitle: 'publishedAt',
            media: 'coverImage',
        },
    },
})
