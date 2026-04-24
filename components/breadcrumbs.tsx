import Link from 'next/link'
import JsonLd from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/seo'

export interface Crumb {
    name: string
    path: string
}

export default function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
    return (
        <>
            <JsonLd data={breadcrumbSchema(items)} />
            <nav
                aria-label="Breadcrumb"
                className={`text-xs text-[#555555] mb-6 ${className ?? ''}`}
            >
                <ol className="flex flex-wrap items-center gap-1">
                    {items.map((item, i) => {
                        const isLast = i === items.length - 1
                        return (
                            <li key={item.path} className="flex items-center gap-1">
                                {isLast ? (
                                    <span className="text-[#111111]" aria-current="page">
                                        {item.name}
                                    </span>
                                ) : (
                                    <>
                                        <Link
                                            href={item.path}
                                            className="hover:text-[#fd80b5] transition-colors"
                                        >
                                            {item.name}
                                        </Link>
                                        <span aria-hidden className="text-[#EAEAEA]">
                                            /
                                        </span>
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ol>
            </nav>
        </>
    )
}
