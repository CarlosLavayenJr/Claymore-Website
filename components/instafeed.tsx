'use client'

import { useEffect, useRef } from 'react'

const ELFSIGHT_SRC = 'https://static.elfsight.com/platform/platform.js'

// Elfsight's platform script is heavy third-party JS, so it's only injected once the
// feed is about to scroll into view rather than on every page load.
const InstagramFeed = () => {
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        let script: HTMLScriptElement | null = null
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return
                observer.disconnect()
                if (document.querySelector(`script[src="${ELFSIGHT_SRC}"]`)) return
                script = document.createElement('script')
                script.src = ELFSIGHT_SRC
                script.async = true
                document.body.appendChild(script)
            },
            { rootMargin: '600px 0px' },
        )
        observer.observe(el)

        return () => {
            observer.disconnect()
            script?.remove()
        }
    }, [])

    return (
        <div
            ref={containerRef}
            className="elfsight-app-07e8ec33-1ec4-4bf3-bb7f-aa7acefaf756"
            data-elfsight-app-lazy=""
        />
    )
}

export default InstagramFeed
