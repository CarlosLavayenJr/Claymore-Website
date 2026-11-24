import { useRef } from 'react'
import { useFormValue } from 'sanity'
import { Button, Card, Flex, Stack, Text } from '@sanity/ui'
import { DownloadIcon } from '@sanity/icons'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import { buildQrUrl, slugify } from '@/sanity/lib/qr'

// Print-quality PNG size. The on-screen preview is smaller.
const PNG_SIZE = 1024

function triggerDownload(href: string, filename: string) {
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    a.click()
}

export function QrCodePreview() {
    const title = useFormValue(['title']) as string | undefined
    const destination = useFormValue(['destination']) as string | undefined
    const medium = useFormValue(['medium']) as string | undefined
    const campaign = useFormValue(['campaign']) as string | undefined

    const svgWrapRef = useRef<HTMLDivElement>(null)
    const canvasWrapRef = useRef<HTMLDivElement>(null)

    const url = buildQrUrl({ destination, medium, campaign })
    const filename = `claymores-qr-${slugify(title || 'code') || 'code'}`

    if (!url) {
        return (
            <Card padding={4} radius={2} tone="caution" border>
                <Text size={1}>Enter a destination above to generate the QR code.</Text>
            </Card>
        )
    }

    const downloadSvg = () => {
        const svg = svgWrapRef.current?.querySelector('svg')
        if (!svg) return
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
        const href = URL.createObjectURL(blob)
        triggerDownload(href, `${filename}.svg`)
        URL.revokeObjectURL(href)
    }

    const downloadPng = () => {
        const canvas = canvasWrapRef.current?.querySelector('canvas')
        if (!canvas) return
        triggerDownload(canvas.toDataURL('image/png'), `${filename}.png`)
    }

    return (
        <Card padding={4} radius={2} border>
            <Stack space={4}>
                <Flex justify="center">
                    <div ref={svgWrapRef} style={{ background: '#fff', padding: 8, lineHeight: 0 }}>
                        <QRCodeSVG value={url} size={220} level="M" marginSize={2} title={url} />
                    </div>
                </Flex>

                {/* Hidden high-res canvas used for PNG export */}
                <div ref={canvasWrapRef} style={{ display: 'none' }}>
                    <QRCodeCanvas value={url} size={PNG_SIZE} level="M" marginSize={2} />
                </div>

                <Text size={1} muted style={{ wordBreak: 'break-all' }}>
                    {url}
                </Text>

                <Flex gap={2}>
                    <Button icon={DownloadIcon} text="Download PNG" tone="primary" onClick={downloadPng} />
                    <Button icon={DownloadIcon} text="Download SVG" mode="ghost" onClick={downloadSvg} />
                    <Button text="Test link" mode="bleed" as="a" href={url} target="_blank" rel="noopener noreferrer" />
                </Flex>
            </Stack>
        </Card>
    )
}
