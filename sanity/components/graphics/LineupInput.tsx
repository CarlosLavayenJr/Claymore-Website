import { Button, Stack, Text } from '@sanity/ui'
import { insert, PatchEvent, setIfMissing, type ArrayOfObjectsInputProps } from 'sanity'

/** Keep Sanity's reference picker and collaborative keyed-array patches. */
export function LineupInput(props: ArrayOfObjectsInputProps) {
    const value = props.value as { number?: number }[] | undefined
    const assigned = new Set((value ?? []).map(slot => slot.number))
    const missing = Array.from({ length: 15 }, (_, i) => i + 1).filter(number => !assigned.has(number))
    const addStartingSlots = () => props.onChange(PatchEvent.from([
        setIfMissing([]),
        insert(missing.map(number => ({ _type: 'lineupSlot', _key: crypto.randomUUID().replaceAll('-', ''), number })), 'after', [-1]),
    ]))
    return <Stack space={3}>
        {missing.length > 0 && <Button text="Add missing starting XV slots" mode="ghost" disabled={props.readOnly} onClick={addStartingSlots} />}
        <Text size={1} muted>Numbers 1–15 are the starting XV; 16–23 are replacements. Open each slot to choose its player and leadership role.</Text>
        {props.renderDefault(props)}
    </Stack>
}
