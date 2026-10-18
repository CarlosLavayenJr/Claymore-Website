import { defineField, defineType } from 'sanity'
import { QrCodePreview } from '@/sanity/components/QrCodePreview'
import { buildQrUrl } from '@/sanity/lib/qr'

export const qrCode = defineType({
    name: 'qrCode',
    title: 'QR Code',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            description: 'Internal name, e.g. "Fall recruiting flyer". Also used for the download filename.',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'destination',
            title: 'Destination',
            type: 'string',
            description:
                'A site path like "/join", "/fixtures" or "/blog/my-post", or a full URL. Tip: copy the path from the address bar.',
            validation: (rule) =>
                rule.required().custom((value) =>
                    !value || /^(\/|https?:\/\/)/i.test(value.trim())
                        ? true
                        : 'Start with "/" for a site page, or "https://" for a full URL',
                ),
        }),
        defineField({
            name: 'campaign',
            title: 'Tracking Campaign',
            type: 'string',
            description:
                'Optional. Adds UTM tags so scans show up separately in analytics, e.g. "fall-recruiting-2026". Leave blank for a plain link.',
        }),
        defineField({
            name: 'medium',
            title: 'Where it will be printed',
            type: 'string',
            options: {
                list: [
                    { title: 'Flyer / poster', value: 'flyer' },
                    { title: 'Banner', value: 'banner' },
                    { title: 'Business card', value: 'card' },
                    { title: 'Merch / apparel', value: 'merch' },
                    { title: 'Event / matchday', value: 'event' },
                    { title: 'Other print', value: 'print' },
                ],
            },
            initialValue: 'flyer',
            hidden: ({ parent }) => !parent?.campaign,
        }),
        defineField({
            name: 'qrPreview',
            title: 'QR Code',
            type: 'string',
            readOnly: true,
            components: { input: QrCodePreview },
        }),
    ],
    preview: {
        select: {
            title: 'title',
            destination: 'destination',
            medium: 'medium',
            campaign: 'campaign',
        },
        prepare({ title, destination, medium, campaign }) {
            return {
                title: title || 'QR Code',
                subtitle: buildQrUrl({ destination, medium, campaign }) ?? 'No destination',
            }
        },
    },
})
