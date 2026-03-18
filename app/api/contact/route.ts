import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
    const { name, email, subject, message } = await req.json()

    if (!name || !email || !message) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { error } = await resend.emails.send({
        from: 'Claymores Website <no-reply@claymoresrfc.com>',
        to: 'info@claymoresrfc.com',
        replyTo: email,
        subject: subject || `New message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
    })

    if (error) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
