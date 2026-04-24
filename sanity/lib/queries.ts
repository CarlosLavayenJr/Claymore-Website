import { groq } from 'next-sanity'

export interface SanityPlayer {
    _id: string
    _updatedAt?: string
    name: string
    slug: string
    active: boolean
    position: string
    height: string
    weight: string
    imageUrl: string | null
    imageAlt: string | null
    description: string
    mediaTag: string | null
}

export const playersQuery = groq`
  *[_type == "player" && active == true] | order(name asc) {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    active,
    position,
    height,
    weight,
    "imageUrl": image.asset->url,
    "imageAlt": image.alt,
    description,
    mediaTag
  }
`

export const playerBySlugQuery = groq`
  *[_type == "player" && slug.current == $slug && active == true][0] {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    active,
    position,
    height,
    weight,
    "imageUrl": image.asset->url,
    "imageAlt": image.alt,
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
    _updatedAt?: string
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
    venue?: string | null
    kickoffTime?: string | null
    recap?: unknown[] | null
    homeTeamLogo?: string | null
    awayTeamLogo?: string | null
    homeTeamSlug?: string | null
    awayTeamSlug?: string | null
}

export const matchesQuery = groq`
  *[_type == "match"] | order(date asc) {
    _id,
    _updatedAt,
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
    venue,
    kickoffTime,
    "homeTeamLogo": homeTeamRef->image.asset->url,
    "awayTeamLogo": awayTeamRef->image.asset->url,
    "homeTeamSlug": homeTeamRef->slug.current,
    "awayTeamSlug": awayTeamRef->slug.current
  }
`

export const matchBySlugQuery = groq`
  *[_type == "match" && _id == $id][0] {
    _id,
    _updatedAt,
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
    venue,
    kickoffTime,
    recap,
    "homeTeamLogo": homeTeamRef->image.asset->url,
    "awayTeamLogo": awayTeamRef->image.asset->url,
    "homeTeamSlug": homeTeamRef->slug.current,
    "awayTeamSlug": awayTeamRef->slug.current,
    "homeTeamCity": homeTeamRef->city,
    "awayTeamCity": awayTeamRef->city
  }
`

export interface SanityTeam {
    _id: string
    _updatedAt?: string
    name: string
    slug?: string | null
    aliases: string[]
    logoUrl: string | null
    logoAlt?: string | null
    city?: string | null
    website?: string | null
    description?: string | null
}

export const teamsQuery = groq`
  *[_type == "team"] {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    aliases,
    "logoUrl": image.asset->url,
    "logoAlt": image.alt,
    city,
    website,
    description
  }
`

export const teamBySlugQuery = groq`
  *[_type == "team" && slug.current == $slug][0] {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    aliases,
    "logoUrl": image.asset->url,
    "logoAlt": image.alt,
    city,
    website,
    description
  }
`

export interface SanityPost {
    _id: string
    _updatedAt?: string
    title: string
    slug: { current: string }
    publishedAt: string
    excerpt: string | null
    coverImageUrl: string | null
    coverImageAlt?: string | null
    body: unknown[]
    mediaTag: string | null
}

export const postsQuery = groq`
  *[_type == "post"] | order(publishedAt desc) {
    _id,
    _updatedAt,
    title,
    slug,
    publishedAt,
    excerpt,
    "coverImageUrl": coverImage.asset->url,
    "coverImageAlt": coverImage.alt
  }
`

export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0] {
    _id,
    _updatedAt,
    title,
    slug,
    publishedAt,
    excerpt,
    "coverImageUrl": coverImage.asset->url,
    "coverImageAlt": coverImage.alt,
    body[]{
      ...,
      asset->
    },
    "mediaTag": mediaTag->name.current
  }
`

export interface SanityCoach {
    _id: string
    _updatedAt?: string
    name: string
    slug: string
    role: string
    order: number
    active: boolean
    imageUrl: string | null
    imageAlt: string | null
    bio: string | null
    credentials: string[] | null
}

export const coachesQuery = groq`
  *[_type == "coach" && active == true] | order(order asc, name asc) {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    role,
    order,
    active,
    "imageUrl": image.asset->url,
    "imageAlt": image.alt,
    bio,
    credentials
  }
`

export const coachBySlugQuery = groq`
  *[_type == "coach" && slug.current == $slug && active == true][0] {
    _id,
    _updatedAt,
    name,
    "slug": slug.current,
    role,
    order,
    active,
    "imageUrl": image.asset->url,
    "imageAlt": image.alt,
    bio,
    credentials
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
