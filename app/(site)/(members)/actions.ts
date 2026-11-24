'use server'

import { AuthError } from 'next-auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { signIn, signOut } from '@/auth'
import { ClaymoresApiClient } from '@/lib/claymores/api-client'
import { apiBaseUrl, devSignInEnabled, memberAuthEnabled, SIGNED_IN_HINT_COOKIE } from '@/lib/claymores/auth-env'
import { getMemberToken, safeCallbackUrl } from '@/lib/claymores/member'

export async function signInWithGoogle(formData: FormData) {
    if (!memberAuthEnabled()) redirect('/sign-in')
    await signIn('google', { redirectTo: safeCallbackUrl(formData.get('callbackUrl')) })
}

export async function signInForDevelopment(formData: FormData) {
    if (!devSignInEnabled()) redirect('/sign-in')
    try {
        await signIn('dev', {
            email: String(formData.get('email') ?? ''),
            redirectTo: safeCallbackUrl(formData.get('callbackUrl')),
        })
    } catch (error) {
        if (error instanceof AuthError) redirect('/sign-in?error=invalid')
        throw error
    }
}

export async function signOutMember() {
    if (!memberAuthEnabled()) redirect('/')
    const token = await getMemberToken()
    if (token?.api?.refreshToken) {
        // Best effort: revoke the API sign-in session. Sign out locally regardless.
        await new ClaymoresApiClient({ baseUrl: apiBaseUrl(), timeoutMs: 5000 }).logout(token.api.refreshToken)
    }
    ;(await cookies()).delete(SIGNED_IN_HINT_COOKIE)
    await signOut({ redirectTo: '/sign-in?signedOut=1' })
}
