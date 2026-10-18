import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
// Constrain a Sanity CDN image to a max width, served as WebP/AVIF where supported.
export function sanityWidth(url: string, width: number): string {
    if (!url.startsWith('https://cdn.sanity.io/images/') || url.endsWith('.svg')) return url
    return `${url}${url.includes('?') ? '&' : '?'}w=${width}&fit=max&auto=format`
}

// Resize a Sanity CDN image server-side (used where next/image runs `unoptimized`,
// e.g. team logos that may be SVG). Non-Sanity URLs and SVGs pass through untouched.
export function sanityThumb(url: string, px: number): string {
    if (!url.startsWith('https://cdn.sanity.io/images/') || url.endsWith('.svg')) return url
    const size = px * 2 // 2x for high-DPI screens
    return `${url}${url.includes('?') ? '&' : '?'}w=${size}&h=${size}&fit=max&auto=format`
}
