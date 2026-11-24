'use client'

import { useId, useSyncExternalStore } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

type ScheduleView = 'games' | 'all'
let currentView: ScheduleView = 'all'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
const getSnapshot = () => currentView
const getServerSnapshot = (): ScheduleView => 'all'
function setView(view: ScheduleView) {
    currentView = view
    listeners.forEach(listener => listener())
}

// Share the selection across the homepage widgets and fixtures during navigation.
export function useScheduleFilter() {
    return [useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), setView] as const
}

export function ScheduleFilter({ value, onChange }: {
    value: ScheduleView
    onChange: (value: ScheduleView) => void
}) {
    const indicatorId = useId()
    const reduceMotion = useReducedMotion()

    return (
        <div role="group" aria-label="Schedule events" className="inline-flex max-w-full items-center gap-6 border-b border-[#EAEAEA]">
            {(['games', 'all'] as const).map(option => (
                <button
                    key={option}
                    type="button"
                    aria-pressed={value === option}
                    onClick={() => onChange(option)}
                    className={`relative -mb-px min-h-11 border-b-2 border-transparent px-0 py-3 text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#77c3ef] ${value === option ? 'text-[#111111]' : 'text-[#777777] hover:text-[#111111]'}`}
                >
                    {option === 'games' ? 'Games only' : 'Games & practices'}
                    {value === option && (
                        <motion.span
                            layoutId={`schedule-filter-${indicatorId}`}
                            aria-hidden="true"
                            className="absolute -bottom-0.5 inset-x-0 h-0.5 bg-[#77c3ef]"
                            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
                        />
                    )}
                </button>
            ))}
        </div>
    )
}
