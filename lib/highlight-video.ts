// Team highlight video, hosted on YouTube. Swap the ID/metadata here to change it site-wide.
export const highlightVideo = {
    youtubeId: 'SAawJ3R6EDs',
    title: 'Central Florida Claymores RFC — 2026 Orlando Rugby Highlights',
    description:
        'Highlights from the Central Florida Claymores RFC 2026 season. Orlando rugby in the Florida Rugby Union, USA Rugby D3. No experience needed to join.',
    uploadDate: '2026-09-27T17:51:55-07:00',
    duration: 'PT2M42S',
}

export const youtubeThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`

export function videoObjectSchema(video = highlightVideo) {
    return {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.title,
        description: video.description,
        thumbnailUrl: [youtubeThumbnail(video.youtubeId)],
        uploadDate: video.uploadDate,
        duration: video.duration,
        contentUrl: `https://www.youtube.com/watch?v=${video.youtubeId}`,
        embedUrl: `https://www.youtube.com/embed/${video.youtubeId}`,
    }
}
