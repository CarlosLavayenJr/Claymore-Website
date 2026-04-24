import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CSSProperties, ReactNode } from 'react'

// Shared OG image template for the entire site.
//
// All opengraph-image.tsx files should call `brandedImageResponse(...)` so
// every share card looks the same: dark gradient, vertical logo on the left,
// Claymore display font for the headline, brand pink/blue accents.

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = 'image/png' as const

const PINK = '#fd80b5'
const BLUE = '#77c3ef'
const BLUE_SOFT = '#a8c4d6'

let _claymoreFont: Buffer | null = null
function loadClaymoreFont(): Buffer {
    if (!_claymoreFont) {
        _claymoreFont = readFileSync(join(process.cwd(), 'public/fonts/VIKING-N.woff'))
    }
    return _claymoreFont
}

let _verticalLogo: string | null = null
function loadVerticalLogoDataUri(): string {
    if (!_verticalLogo) {
        const buf = readFileSync(join(process.cwd(), 'public/assets/Claymoresvertical.png'))
        _verticalLogo = `data:image/png;base64,${buf.toString('base64')}`
    }
    return _verticalLogo
}

export type BrandedOGProps = {
    /** Small uppercase label shown above the title (defaults to club name). */
    eyebrow?: string
    /** Large headline (rendered in Claymore display font). */
    title: string
    /** Optional supporting line under the title. */
    subtitle?: string
    /** Left-side line in the footer (defaults to claymoresrfc.com). */
    footerLeft?: string
    /** Right-side line in the footer (defaults to "Orlando · Florida Rugby Union"). */
    footerRight?: string
    /** Optional pill in the top-right corner (e.g. "WIN", "HOME"). */
    badge?: string
    /** Override the accent color used for eyebrow and badge. */
    accent?: string
    /** Optional extra block rendered between subtitle and footer (e.g. score). */
    extra?: ReactNode
    /** Hide the vertical logo (rare; use only for dense layouts like match cards). */
    hideLogo?: boolean
}

const containerStyle: CSSProperties = {
    height: '100%',
    width: '100%',
    display: 'flex',
    background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)',
    color: '#fff',
    padding: '60px 70px',
    fontFamily: 'sans-serif',
}

function pickTitleSize(title: string): number {
    const len = title.length
    if (len > 56) return 64
    if (len > 40) return 80
    if (len > 26) return 100
    if (len > 16) return 120
    return 140
}

function brandedJsx(props: BrandedOGProps) {
    const {
        eyebrow,
        title,
        subtitle,
        footerLeft = 'claymoresrfc.com',
        footerRight = 'Orlando · Florida Rugby Union',
        badge,
        accent = PINK,
        extra,
        hideLogo = false,
    } = props
    const logoSrc = hideLogo ? null : loadVerticalLogoDataUri()
    const titleSize = pickTitleSize(title)

    return (
        <div style={containerStyle}>
            {logoSrc && (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 56,
                        flexShrink: 0,
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoSrc} width={210} height={290} alt="" />
                </div>
            )}

            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minWidth: 0,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 24,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            fontSize: 18,
                            letterSpacing: 6,
                            textTransform: 'uppercase',
                            color: accent,
                            fontWeight: 700,
                        }}
                    >
                        {eyebrow ?? 'Central Florida Claymores RFC'}
                    </div>
                    {badge && (
                        <div
                            style={{
                                display: 'flex',
                                background: accent,
                                color: '#0b1c25',
                                padding: '8px 20px',
                                borderRadius: 999,
                                fontSize: 18,
                                fontWeight: 800,
                                letterSpacing: 2,
                            }}
                        >
                            {badge}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 18,
                        paddingTop: 20,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            fontSize: titleSize,
                            lineHeight: 0.95,
                            fontWeight: 400,
                            letterSpacing: 1,
                            fontFamily: 'Claymore, sans-serif',
                            color: '#fff',
                            textTransform: 'uppercase',
                        }}
                    >
                        {title}
                    </div>
                    {subtitle && (
                        <div
                            style={{
                                display: 'flex',
                                fontSize: 28,
                                color: BLUE_SOFT,
                                lineHeight: 1.2,
                                maxWidth: 820,
                            }}
                        >
                            {subtitle}
                        </div>
                    )}
                    {extra && <div style={{ display: 'flex' }}>{extra}</div>}
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 20,
                        color: BLUE,
                    }}
                >
                    <span>{footerLeft}</span>
                    <span>{footerRight}</span>
                </div>
            </div>
        </div>
    )
}

export function brandedImageResponse(
    props: BrandedOGProps,
    opts?: { size?: { width: number; height: number } }
): ImageResponse {
    const font = loadClaymoreFont()
    const size = opts?.size ?? OG_SIZE
    return new ImageResponse(brandedJsx(props), {
        ...size,
        fonts: [
            {
                name: 'Claymore',
                data: font,
                weight: 400,
                style: 'normal',
            },
        ],
    })
}

// Convenience so callers can re-export the standard Next.js metadata fields
// without restating the same constants in every opengraph-image file.
export const ogMeta = {
    size: OG_SIZE,
    contentType: OG_CONTENT_TYPE,
}

// Build the `openGraph.images` / `twitter.images` value that points at a
// branded OG image. Pass the route path (without trailing slash) to use that
// route's local opengraph-image; pass nothing to use the site-wide default.
//
// Examples:
//   ogImage()                                       → /opengraph-image
//   ogImage('/team')                                → /team/opengraph-image (root default bubbles up)
//   ogImage(`/fixtures/${slug}`)                    → per-match generated card
//
// We must reference the image explicitly because per-page openGraph metadata
// shallow-overrides the parent's images, so the file-convention auto-injection
// does not survive page-level openGraph blocks.
export function ogImage(routePath?: string) {
    const url = routePath ? `${routePath}/opengraph-image` : '/opengraph-image'
    return [
        {
            url,
            width: OG_SIZE.width,
            height: OG_SIZE.height,
            alt: 'Central Florida Claymores RFC — Orlando Rugby',
        },
    ]
}
