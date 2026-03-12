import { groq } from 'next-sanity'

export interface SanityPlayer {
    _id: string
    name: string
    position: string
    number: number
    height: string
    weight: string
    age: number
    imageUrl: string | null
    description: string
}

export const playersQuery = groq`
  *[_type == "player"] | order(number asc) {
    _id,
    name,
    position,
    number,
    height,
    weight,
    age,
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
