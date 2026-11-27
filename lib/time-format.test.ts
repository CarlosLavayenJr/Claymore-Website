import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTime } from './time-format'

test('every way the sources write a time comes out the same', () => {
    assert.equal(formatTime('1:00pm'), '1:00 PM')
    assert.equal(formatTime('2:00 PM'), '2:00 PM')
    assert.equal(formatTime('11am'), '11:00 AM')
    assert.equal(formatTime('8:00PM - 10:00PM'), '8:00 PM – 10:00 PM')
    assert.equal(formatTime('8–10pm'), '8:00 PM – 10:00 PM')
    assert.equal(formatTime('6:30 PM – 8:00 PM'), '6:30 PM – 8:00 PM')
})

test('unknown text and blanks pass through', () => {
    assert.equal(formatTime('TBA'), 'TBA')
    assert.equal(formatTime('All day'), 'All day')
    assert.equal(formatTime(undefined), undefined)
})
