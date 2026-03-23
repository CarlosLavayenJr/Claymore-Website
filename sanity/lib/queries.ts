import { groq } from 'next-sanity'

export interface SanityPlayer {
    _id: string
    name: string
    slug: string
    active: boolean
    position: string
    height: string
    weight: string
    imageUrl: string | null
    description: string
    mediaTag: string | null
}

export const playersQuery = groq`
  *[_type == "player" && active == true] | order(name asc) {
    _id,
    name,
    "slug": slug.current,
    active,
    position,
    height,
    weight,
    "imageUrl": image.asset->url,
    description,
    mediaTag
  }
`

export const playerBySlugQuery = groq`
  *[_type == "player" && slug.current == $slug && active == true][0] {
    _id,
    name,
    "slug": slug.current,
    active,
    position,
    height,
    weight,
    "imageUrl": image.asset->url,
    description,
    "mediaTag": mediaTag->name.current
  }
`

export interface SanityPlayerPhoto {
    _id: string
    url: string
    aspectRatio: number
}

export const playerPhotosQuery = groq`
  *[_type == "sanity.imageAsset" && $tag in opt.media.tags[]->name.current] {
    _id,
    url,
    "aspectRatio": metadata.dimensions.aspectRatio
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
    matchType?: 'league' | 'friendly'
    competition?: string
    note?: string
    homeTeamLogo?: string | null
    awayTeamLogo?: string | null
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
    matchType,
    competition,
    note,
    "homeTeamLogo": homeTeamRef->image.asset->url,
    "awayTeamLogo": awayTeamRef->image.asset->url
  }
`

export interface SanityTeam {
    _id: string
    name: string
    aliases: string[]
    logoUrl: string | null
}

export const teamsQuery = groq`
  *[_type == "team"] {
    _id,
    name,
    aliases,
    "logoUrl": image.asset->url
  }
`

export interface SanityPost {
    _id: string
    title: string
    slug: { current: string }
    publishedAt: string
    excerpt: string | null
    coverImageUrl: string | null
    body: unknown[]
    mediaTag: string | null
}

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

export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0] {
    _id,
    title,
    slug,
    publishedAt,
    excerpt,
    "coverImageUrl": coverImage.asset->url,
    body[]{
      ...,
      asset->
    },
    "mediaTag": mediaTag->name.current
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
