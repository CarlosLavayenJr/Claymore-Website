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

export interface SanityMatch {
    _id: string
    date: string
    season: number
    homeTeam: string
    homeScore: number
    awayTeam: string
    awayScore: number
    status: 'played' | 'upcoming' | 'cancelled' | 'forfeit_us' | 'forfeit_them'
    note?: string
}

export const matchesQuery = groq`
  *[_type == "match"] | order(date asc) {
    _id,
    date,
    season,
    homeTeam,
    homeScore,
    awayTeam,
    awayScore,
    status,
    note
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

export interface SanityTeamPhoto {
    _id: string
    url: string
    aspectRatio: number
}

export const teamPhotosQuery = groq`
  *[_type == "sanity.imageAsset" && "team" in opt.media.tags[]->name.current] {
    _id,
    url,
    "aspectRatio": metadata.dimensions.aspectRatio
  }
`
