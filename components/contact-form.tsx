'use client'

import { useState, ChangeEvent, FormEvent } from 'react'

interface FormData {
    name: string
    email: string
    subject: string
    message: string
}

export default function ContactForm() {
    const [formData, setFormData] = useState<FormData>({
        name: '',
        email: '',
        subject: '',
        message: '',
    })
    const [submitted, setSubmitted] = useState(false)

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setSubmitted(true)
    }

    if (submitted) {
        return (
            <div className="bg-muted rounded-xl p-8 text-center">
                <p className="text-2xl font-claymore mb-2">Message sent.</p>
                <p className="text-muted-foreground">We&apos;ll be in touch soon. See you on the pitch.</p>
            </div>
        )
    }

    const inputClass =
        'w-full bg-background border border-border rounded-md px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#78c3ef] transition-colors'
    const labelClass = 'block text-sm font-semibold mb-1'

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div>
                <label htmlFor="name" className={labelClass}>Name</label>
                <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Your full name"
                    required
                />
            </div>
            <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="you@example.com"
                    required
                />
            </div>
            <div>
                <label htmlFor="subject" className={labelClass}>Subject</label>
                <input
                    type="text"
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    className={inputClass}
                    placeholder="Joining the team, general question…"
                    required
                />
            </div>
            <div>
                <label htmlFor="message" className={labelClass}>Message</label>
                <textarea
                    id="message"
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    rows={5}
                    className={inputClass}
                    placeholder="Tell us a bit about yourself and what you're looking for."
                    required
                />
            </div>
            <button
                type="submit"
                className="w-full bg-[#78c3ef] text-black font-bold py-3 rounded-md hover:bg-white transition-colors text-sm uppercase tracking-wide"
            >
                Send Message
            </button>
        </form>
    )
}
