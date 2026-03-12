import { groq } from 'next-sanity'

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
