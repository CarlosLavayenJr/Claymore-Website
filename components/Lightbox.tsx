'use client'

import YARLightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'

interface LightboxProps {
    images: string[]
    index: number       // -1 = closed
    onClose: () => void
}

export default function Lightbox({ images, index, onClose }: LightboxProps) {
    return (
        <YARLightbox
            open={index >= 0}
            close={onClose}
            index={index}
            slides={images.map(src => ({ src }))}
        />
    )
}
