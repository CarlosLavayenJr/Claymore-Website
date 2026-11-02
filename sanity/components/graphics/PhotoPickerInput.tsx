'use client'

import { useCallback, useEffect, useState } from 'react'
import { set, unset, useClient, useFormValue, type ObjectInputProps } from 'sanity'
import { Box, Button, Card, Flex, Grid, Stack, Text } from '@sanity/ui'
import { publishedId, type PhotoRecord, type Reference } from '@/lib/graphics/model'

const API_VERSION = '2025-01-01'
const PAGE = 24
// Transparent images that no player or team uses yet, newest first. Club logos are excluded.
const PICKER_QUERY = `{
    "players": *[_type == "player" && _id in $ids]{_id, name, "cutouts": cutouts[]{"assetId": asset._ref, "url": asset->url, "hasAlpha": asset->metadata.hasAlpha}},
    "unassigned": *[_type == "sanity.imageAsset" && metadata.hasAlpha == true
        && !("logo" in coalesce(opt.media.tags[]->name.current, []))
        && count(*[_type in ["player", "team"] && references(^._id)]) == 0
    ] | order(_createdAt desc){"assetId": _id, url, "hasAlpha": metadata.hasAlpha, originalFilename}
}`
type PickerPlayer = { _id: string; name?: string; cutouts?: PhotoRecord[] | null }
type Unassigned = PhotoRecord & { originalFilename?: string }

const thumb = (url?: string) => url ? `${url}?w=200&h=260&fit=max` : undefined

function Tile({ photo, selected, label, disabled, onClick }: { photo: PhotoRecord; selected?: boolean; label?: string; disabled?: boolean; onClick: () => void }) {
    return <Card as="button" type="button" padding={1} radius={2} border tone={selected ? 'primary' : 'transparent'} disabled={disabled}
        onClick={onClick} title={label} style={{ cursor: disabled ? 'wait' : 'pointer', outline: selected ? '2px solid var(--card-focus-ring-color)' : undefined }}>
        <Stack space={1}>
            {/* Checkerboard makes transparency visible at a glance. */}
            <Box style={{ aspectRatio: '4 / 5', background: 'repeating-conic-gradient(#8884 0 25%, transparent 0 50%) 0 0 / 16px 16px', borderRadius: 2 }}>
                <img src={thumb(photo.url)} alt={label ?? ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </Box>
            {label && <Text size={0} muted textOverflow="ellipsis">{label}</Text>}
        </Stack>
    </Card>
}

/** Choose a lineup slot's photo from the selected player's cutouts, or claim an unassigned transparent image for them. */
export function PhotoPickerInput(props: ObjectInputProps) {
    const { onChange, path, readOnly } = props
    const value = props.value as { asset?: Reference } | undefined
    const playerRef = useFormValue([...path.slice(0, -1), 'player']) as Reference | undefined
    const playerId = playerRef?._ref ? publishedId(playerRef._ref) : undefined
    const client = useClient({ apiVersion: API_VERSION }).withConfig({ useCdn: false, perspective: 'raw' })
    const [players, setPlayers] = useState<PickerPlayer[]>([])
    const [unassigned, setUnassigned] = useState<Unassigned[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [showUnassigned, setShowUnassigned] = useState(false)
    const [limit, setLimit] = useState(PAGE)

    const load = useCallback(async () => {
        if (!playerId) return
        setLoading(true); setError('')
        try {
            const result = await client.fetch<{ players: PickerPlayer[]; unassigned: Unassigned[] }>(PICKER_QUERY, { ids: [playerId, `drafts.${playerId}`] })
            setPlayers(result.players); setUnassigned(result.unassigned)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not load photos.')
        } finally { setLoading(false) }
        // client identity changes every render; playerId is the real input.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerId])
    useEffect(() => { void load() }, [load])

    // Edit the player's draft when one exists so in-progress edits aren't overwritten; otherwise the published record.
    const target = players.find(p => p._id.startsWith('drafts.')) ?? players.find(p => p._id === playerId)
    const cutouts = (target?.cutouts ?? []).filter(c => c.assetId)
    const selectedId = value?.asset?._ref
    const choose = (assetId: string) => onChange(set({ _type: 'image', asset: { _type: 'reference', _ref: assetId } }))

    const claim = async (photo: Unassigned) => {
        if (!target || !photo.assetId) return
        setBusy(true); setError('')
        try {
            await client.patch(target._id).setIfMissing({ cutouts: [] })
                .append('cutouts', [{ _type: 'image', _key: crypto.randomUUID().replaceAll('-', '').slice(0, 12), asset: { _type: 'reference', _ref: photo.assetId } }])
                .commit({ autoGenerateArrayKeys: false })
            choose(photo.assetId)
            await load()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save the photo to the player.')
        } finally { setBusy(false) }
    }

    if (!playerId) return <Text size={1} muted>Select a player first.</Text>
    const name = target?.name ?? 'this player'
    const selectedIsKnown = !selectedId || cutouts.some(c => c.assetId === selectedId)

    return <Stack space={3}>
        {error && <Card padding={3} tone="critical" border><Text size={1}>{error}</Text></Card>}
        {loading && !players.length ? <Text size={1} muted>Loading photos…</Text> : <>
            {cutouts.length > 0 ? <>
                <Text size={1} weight="semibold">{name}’s cutouts {!selectedId && <Text as="span" size={1} muted>(using the first by default)</Text>}</Text>
                <Grid columns={[3, 4, 6]} gap={2}>
                    {cutouts.map((c, i) => <Tile key={c.assetId} photo={c} disabled={readOnly || busy}
                        selected={selectedId ? c.assetId === selectedId : i === 0}
                        label={c.hasAlpha === false ? 'Has background' : undefined}
                        onClick={() => choose(c.assetId!)} />)}
                </Grid>
            </> : <Card padding={3} tone="caution" border><Text size={1}>{name} has no cutouts yet. Pick one of the unassigned photos below to add it to their player record.</Text></Card>}
            {!selectedIsKnown && <Text size={1} muted>The selected photo is no longer on {name}’s record.</Text>}
            <Flex gap={2} wrap="wrap">
                {selectedId && <Button text="Use default (first cutout)" mode="ghost" disabled={readOnly} onClick={() => onChange(unset())} />}
                {cutouts.length > 0 && <Button text={showUnassigned ? 'Hide unassigned photos' : `Browse unassigned photos (${unassigned.length})`} mode="bleed" onClick={() => setShowUnassigned(v => !v)} />}
                <Button text="Refresh" mode="bleed" disabled={loading} onClick={() => void load()} />
            </Flex>
            {(showUnassigned || cutouts.length === 0) && <Stack space={2}>
                <Text size={1} muted>Transparent photos not linked to any player, newest first. Picking one adds it to {name}’s cutouts{target?._id.startsWith('drafts.') ? ' (their draft; publish the player to keep it)' : ''}.</Text>
                {unassigned.length === 0 ? <Text size={1} muted>No unassigned transparent photos. Upload one to the media library or the player record.</Text> : <>
                    <Grid columns={[3, 4, 6]} gap={2}>
                        {unassigned.slice(0, limit).map(u => <Tile key={u.assetId} photo={u} label={u.originalFilename} disabled={readOnly || busy || !target} onClick={() => void claim(u)} />)}
                    </Grid>
                    {unassigned.length > limit && <Button text={`Show more (${unassigned.length - limit} left)`} mode="ghost" onClick={() => setLimit(l => l + PAGE)} />}
                </>}
            </Stack>}
        </>}
    </Stack>
}
