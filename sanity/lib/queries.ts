import { groq } from 'next-sanity'

export interface SanityPlayer {
    _id: string
    name: string
    position: string
    height: string
    weight: string
    imageUrl: string | null
    description: string
}

export const playersQuery = groq`
  *[_type == "player"] | order(name asc) {
    _id,
    name,
    position,
    height,
    weight,
    "imageUrl": image.asset->url,
    description
  }
`

export const postsQuery = groq`
  *[_type == "post"] | order(publishedAt desc) {
    _id,
    title,
    slug,
    publishedAt,
    excerpt,
    "coverImageUrl": coverImage.asset->url
  }
`
