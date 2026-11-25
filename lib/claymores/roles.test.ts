import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPickLineups, isClubAdmin, isInvitableRole, isStaffRole, isSuperAdmin, plays, roleLabel } from './roles'

test('coaches and the super admin pick lineups; admins only see them', () => {
    assert.deepEqual(['superadmin', 'coach', 'admin', 'player'].map(canPickLineups), [true, true, false, false])
    assert.deepEqual(['superadmin', 'coach', 'admin', 'player', null].map(isClubAdmin), [true, true, true, false, false])
})

test('everyone plays except coaches', () => {
    assert.deepEqual(['superadmin', 'coach', 'admin', 'player'].map(plays), [true, false, true, true])
})

test('only the super admin hands out roles, and the super admin is never an invitation', () => {
    assert.equal(isSuperAdmin('superadmin'), true)
    assert.equal(isSuperAdmin('admin'), false)
    assert.equal(isInvitableRole('coach'), true)
    assert.equal(isInvitableRole('superadmin'), false)
    assert.deepEqual(['admin', 'coach', 'player'].map(isStaffRole), [true, true, false])
    assert.equal(roleLabel('superadmin'), 'Super admin')
})
