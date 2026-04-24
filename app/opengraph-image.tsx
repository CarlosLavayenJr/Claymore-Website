import { ImageResponse } from 'next/og'

export const alt = 'Central Florida Claymores RFC — Orlando Rugby'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    background:
                        'radial-gradient(ellipse 80% 60% at 50% 0%, #1a3a4a 0%, #0f2535 30%, #111111 70%)',
                    color: '#fff',
                    padding: '70px 80px',
                    fontFamily: 'sans-serif',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        fontSize: 18,
                        letterSpacing: 6,
                        textTransform: 'uppercase',
                        color: '#fd80b5',
                        fontWeight: 700,
                    }}
                >
                    Central Florida Claymores RFC
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div
                        style={{
                            fontSize: 92,
                            lineHeight: 1.05,
                            fontWeight: 800,
                            letterSpacing: -2,
                        }}
                    >
                        Orlando&apos;s Rugby Club
                    </div>
                    <div style={{ fontSize: 28, color: '#a8c4d6', display: 'flex' }}>
                        USA Rugby D3 · Florida Rugby Union · Est. 2018
                    </div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: 16,
                        alignItems: 'center',
                        fontSize: 22,
                        color: '#77c3ef',
                    }}
                >
                    <span>claymoresrfc.com</span>
                    <span style={{ color: '#555' }}>·</span>
                    <span>Practice every Thursday</span>
                </div>
            </div>
        ),
        { ...size },
    )
}
