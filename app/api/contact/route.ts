import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY
    if (!secret) return true // not configured — skip (e.g. local dev)
    if (!token) return false

    const body = new URLSearchParams()
    body.append('secret', secret)
    body.append('response', token)
    if (ip) body.append('remoteip', ip)

    try {
        const res = await fetch(TURNSTILE_VERIFY_URL, {
            method: 'POST',
            body,
        })
        const data = (await res.json()) as { success: boolean }
        return data.success === true
    } catch {
        return false
    }
}

export async function POST(req: Request) {
    const { name, email, subject, message, company, turnstileToken } = await req.json()

    if (!name || !email || !message) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Honeypot — if the hidden field is filled, it's almost certainly a bot.
    // Return 200 to keep the bot quiet, but don't send the email.
    if (typeof company === 'string' && company.trim().length > 0) {
        return NextResponse.json({ success: true })
    }

    const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null

    const verified = await verifyTurnstile(turnstileToken, ip)
    if (!verified) {
        return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
    }

    const { error } = await resend.emails.send({
        from: 'Claymores Website <no-reply@claymoresrfc.com>',
        to: 'claymoresrfc@gmail.com',
        replyTo: email,
        subject: subject || `New message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    })

    if (error) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
