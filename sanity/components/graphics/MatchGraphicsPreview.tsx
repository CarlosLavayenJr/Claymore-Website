'use client'

import { useEffect, useMemo, useState } from 'react'
import { useClient, useFormValue } from 'sanity'
import { Button, Card, Flex, Stack, Text } from '@sanity/ui'
import { DownloadIcon } from '@sanity/icons'
import { buildGraphicData, publishedId, type GraphicsDocument, type MatchRecord, type PlayerRecord, type Reference, type TeamRecord } from '@/lib/graphics/model'
import { renderGraphic } from '@/lib/graphics/render'
import { downloadBlob, graphicPng, inlineGraphicAssets, loadGraphicFont } from './assets'

const API_VERSION = '2025-01-01'
const SOURCE_QUERY = `{
    "matches": *[_type == "match" && _id in $ids]{_id,date,kickoffTime,venue,homeTeam,awayTeam,homeScore,awayScore,status,competition,homeTeamRef,awayTeamRef},
    "players": *[_type == "player" && _id in $ids]{_id,name,graphicName,active,eligiblePositions,"cutoutUrl":cutout.asset->url},
    "teams": *[_type == "team"]{_id,name,"logoUrl":image.asset->url},
    "background": *[_type == "sanity.imageAsset" && _id == $background][0].url
}`
type RawMatch = Omit<MatchRecord, 'homeTeamRef' | 'awayTeamRef'> & { homeTeamRef?: Reference; awayTeamRef?: Reference }
type Sources = { matches: RawMatch[]; players: PlayerRecord[]; teams: TeamRecord[]; background?: string }
function preferDrafts<T extends { _id?: string }>(records: T[]): T[] {
    const selected = new Map<string, T>()
    for (const record of records) {
        if (!record._id) continue
        const id = publishedId(record._id)
        if (!selected.has(id) || record._id.startsWith('drafts.')) selected.set(id, record)
    }
    return [...selected.values()]
}

export function MatchGraphicsPreview() {
    const doc = useFormValue([]) as GraphicsDocument
    const client = useClient({ apiVersion: API_VERSION })
    const sourceKey = JSON.stringify({
        match: doc.match?._ref,
        players: [...new Set([...(doc.lineup ?? []).map(s => s.player?._ref), ...(doc.featuredPlayers ?? []).map(p => p._ref)].filter(Boolean))].sort(),
        background: doc.background?.asset?._ref,
    })
    const [source, setSource] = useState<{ key: string; value: Sources }>()
    const [sourceError, setSourceError] = useState('')
    const [loadingSource, setLoadingSource] = useState(true)
    const [refresh, setRefresh] = useState(0)
    const [art, setArt] = useState<{ key: string; svg: string }>()
    const [renderError, setRenderError] = useState('')
    const [exportError, setExportError] = useState('')
    const [exporting, setExporting] = useState(false)
    const [sourceRevision, setSourceRevision] = useState(0)

    useEffect(() => {
        let current = true
        const controller = new AbortController()
        const selection = JSON.parse(sourceKey) as { match?: string; players: string[]; background?: string }
        const baseIds = [selection.match, ...selection.players].filter((id): id is string => Boolean(id)).map(publishedId)
        const ids = [...new Set(baseIds.flatMap(id => [id, `drafts.${id}`]))]
        setLoadingSource(true); setSourceError(''); setExportError('')
        client.withConfig({ useCdn: false, perspective: 'raw' }).fetch<Sources>(SOURCE_QUERY, { ids, background: selection.background ?? '' }, { signal: controller.signal })
            .then(value => {
                if (!current) return
                setSource({ key: sourceKey, value }); setSourceRevision(r => r + 1); setLoadingSource(false)
            })
            .catch(error => {
                if (!current) return
                setSourceError(error instanceof Error ? error.message : 'Could not load match data.'); setLoadingSource(false)
            })
        return () => { current = false; controller.abort() }
    }, [client, sourceKey, refresh])

    useEffect(() => {
        // Referenced player photos, team crests and match edits should update an open preview.
        let timer: ReturnType<typeof setTimeout> | undefined
        const subscription = client.listen('*[_type in ["match", "player", "team", "sanity.imageAsset"]]', {}, { includeResult: false, visibility: 'query' })
            .subscribe({
                next: () => { setLoadingSource(true); clearTimeout(timer); timer = setTimeout(() => setRefresh(n => n + 1), 300) },
                error: () => setSourceError('Live updates disconnected. Use Refresh data before exporting.'),
            })
        return () => { clearTimeout(timer); subscription.unsubscribe() }
    }, [client])

    const resolved = useMemo(() => {
        const value = source?.key === sourceKey ? source.value : undefined
        const raw = preferDrafts(value?.matches ?? []).find(m => publishedId(m._id) === publishedId(doc.match?._ref ?? ''))
        const teams = preferDrafts(value?.teams ?? [])
        const match: MatchRecord | undefined = raw ? {
            ...raw,
            homeTeamRef: teams.find(t => publishedId(t._id ?? '') === publishedId(raw.homeTeamRef?._ref ?? '')),
            awayTeamRef: teams.find(t => publishedId(t._id ?? '') === publishedId(raw.awayTeamRef?._ref ?? '')),
        } : undefined
        return buildGraphicData(doc, match, preferDrafts(value?.players ?? []), value?.background)
    }, [doc, source, sourceKey])
    const renderKey = JSON.stringify({ data: resolved.data, revision: sourceRevision })
    useEffect(() => {
        let current = true
        const controller = new AbortController()
        setRenderError(''); setExportError('')
        Promise.all([loadGraphicFont(), inlineGraphicAssets(resolved.data, controller.signal)]).then(([font, data]) => {
            if (current) setArt({ key: renderKey, svg: renderGraphic(data, font) })
        }).catch(error => {
            if (current) setRenderError(error instanceof Error ? error.message : 'Could not render the graphic.')
        })
        return () => { current = false; controller.abort() }
        // renderKey is a stable serialization of the complete render input.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renderKey])
    const ready = !loadingSource && !sourceError && !renderError && art?.key === renderKey
    const canDownload = ready && !resolved.errors.length && !exporting
    const filename = `claymores-${doc.template ?? 'featured'}-${resolved.data.date || 'match'}`
    const download = async (format: 'svg' | 'png') => {
        if (!canDownload || !art) return
        setExporting(true); setExportError('')
        try {
            const blob = format === 'svg' ? new Blob([art.svg], { type: 'image/svg+xml;charset=utf-8' }) : await graphicPng(art.svg)
            downloadBlob(blob, `${filename}.${format}`)
        } catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed.') }
        finally { setExporting(false) }
    }
    return <Card padding={3} radius={2} border>
        <Stack space={4}>
            <Text size={1}>Preview uses the current draft and linked match/player records. Download after checking all names, assignments and match details.</Text>
            <Flex gap={2} wrap="wrap">
                <Button icon={DownloadIcon} text="Download PNG" tone="primary" disabled={!canDownload} loading={exporting} onClick={() => void download('png')} />
                <Button icon={DownloadIcon} text="Download SVG" mode="ghost" disabled={!canDownload} onClick={() => void download('svg')} />
                <Button text="Refresh data" mode="bleed" onClick={() => setRefresh(n => n + 1)} />
            </Flex>
            {(sourceError || renderError || exportError) && <Card padding={3} tone="critical" border><Text size={1}>{sourceError || renderError || exportError}</Text></Card>}
            {resolved.errors.length > 0 && <Card padding={3} tone="caution" border><Stack space={3}>
                <Text size={1} weight="semibold">Complete these before downloading:</Text>
                {resolved.errors.map(message => <Text key={message} size={1}>{message}</Text>)}
            </Stack></Card>}
            {resolved.warnings.length > 0 && <Card padding={3} tone="caution" border><Stack space={3}>
                {resolved.warnings.map(message => <Text key={message} size={1}>{message}</Text>)}
            </Stack></Card>}
            {!ready && !sourceError && !renderError && <Text size={1} muted>Updating preview…</Text>}
            {art && <div aria-label="Match graphic preview" style={{ opacity: ready ? 1 : .4, maxWidth: 540, lineHeight: 0 }}>
                {/* Generated SVG escapes all content and inlines only image assets; no user markup is inserted. */}
                <div style={{ width: '100%' }} dangerouslySetInnerHTML={{ __html: art.svg.replace('width="1080" height="1350"', 'width="100%" height="auto"') }} />
            </div>}
            <Text size={1} muted>1080 × 1350 px. Display lettering is exported as paths so the Viking font stays consistent. Edit the content above to regenerate it.</Text>
        </Stack>
    </Card>
}
