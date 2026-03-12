'use client'

import { useEffect } from 'react'

const InstagramFeed = () => {
    useEffect(() => {
        const script = document.createElement('script')
        script.src = 'https://static.elfsight.com/platform/platform.js'
        script.async = true
        document.body.appendChild(script)

        return () => {
            document.body.removeChild(script)
        }
    }, [])

    return (
        <div
            className="elfsight-app-07e8ec33-1ec4-4bf3-bb7f-aa7acefaf756"
            data-elfsight-app-lazy=""
        />
    )
}

export default InstagramFeed
