import type { Font, Path } from 'opentype.js'
import type { GraphicData, GraphicPlayer } from './model'

const PINK = '#fd80b5'
const BLUE = '#77c3ef'
const WHITE = '#ffffff'
const WIDTH = 1080
const HEIGHT = 1350
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
const rect = (x: number, y: number, w: number, h: number, fill: string, opacity = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${opacity}"/>`
const group = (id: string, content: string) => `<g id="${id}">${content}</g>`
const line = (x: number, y: number, x2: number, color = PINK) => `<path d="M${x} ${y}H${x2}" stroke="${color}" stroke-opacity=".65"/>`

/** Serialize finite glyph coordinates without the font library's exponent-string rounding. */
function pathData(path: Path): string {
    const n = (value: number) => {
        if (!Number.isFinite(value)) throw new Error('The display font produced an invalid glyph coordinate.')
        return String(Math.round(value * 100) / 100)
    }
    return path.commands.map(c => {
        switch (c.type) {
            case 'M': case 'L': return `${c.type}${n(c.x)} ${n(c.y)}`
            case 'Q': return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
            case 'C': return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
            case 'Z': return 'Z'
        }
    }).join('')
}

/** All photos/crests must be inlined before rendering: exports make no external requests. */
function image(src: string | undefined, x: number, y: number, w: number, h: number, fit = 'xMidYMid meet') {
    if (!src || !/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);base64,/i.test(src)) return ''
    return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${escape(src)}" preserveAspectRatio="${fit}"/>`
}

/** Paths prevent Viking-font substitution in exported SVGs and canvas PNGs. Content remains editable in Sanity. */
export function renderGraphic(data: GraphicData, font: Font): string {
    const display = (s: string, x: number, y: number, size: number, color = WHITE, max = 970, center = false, opacity = 1) => {
        const measured = font.getAdvanceWidth(s, size)
        const fitted = measured > max ? size * max / measured : size
        const left = center ? x - font.getAdvanceWidth(s, fitted) / 2 : x
        const path = pathData(font.getPath(s, left, y, fitted))
        return `<g aria-label="${escape(s)}" opacity="${opacity}"><path d="${path}" fill="${color}"/></g>`
    }
    const sans = (s: string, x: number, y: number, size = 20, color = '#bdc5cd', center = false) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" fill="${color}" text-anchor="${center ? 'middle' : 'start'}">${escape(s)}</text>`
    const placeholder = (x: number, y: number, w: number, h: number) => {
        const cx = x + w / 2
        return `<ellipse cx="${cx}" cy="${y + h * .11}" rx="${w * .12}" ry="${h * .09}" fill="#4a555e"/><path d="M${cx - w * .14} ${y + h * .23} L${x + w * .13} ${y + h * .3} L${x} ${y + h * .66} L${x + w * .15} ${y + h * .69} L${x + w * .28} ${y + h * .47} L${x + w * .24} ${y + h} H${x + w * .76} L${x + w * .72} ${y + h * .47} L${x + w * .85} ${y + h * .69} L${x + w} ${y + h * .66} L${x + w * .87} ${y + h * .3} L${cx + w * .14} ${y + h * .23}Z" fill="#28323c"/>`
    }
    const playerImage = (p: GraphicPlayer | undefined, x: number, y: number, w: number, h: number) => image(p?.photo, x, y, w, h, 'xMidYMax meet') || placeholder(x, y, w, h)
    const playerAt = (n: number) => data.lineup.find(p => p.number === n)
    const label = (p: GraphicPlayer | undefined) => (p?.name || 'UNASSIGNED').toUpperCase() + (p?.role === 'captain' ? ' (C)' : p?.role === 'viceCaptain' ? ' (VC)' : '')
    const rows = (numbers: number[], x: number, y: number, max: number, step: number, size: number) => numbers.map((n, i) =>
        display(`${n}.`, x, y + i * step, size, PINK, 46) + display(label(playerAt(n)), x + 47, y + i * step, size, WHITE, max - 47),
    ).join('')
    const date = formatGraphicDate(data.date)
    const footer = (y = 1225) => group('match-details', line(60, y - 37, 1020) + display(`${date} / ${data.kickoff}`.toUpperCase(), 540, y, 31, WHITE, 930, true) + sans(data.venue.toUpperCase(), 540, y + 42, 20, '#bdc5cd', true))
    const header = () => group('brand-and-headline', image(data.clubLogo, 45, 34, 60, 112) + display('CLAYMORES R.F.C.', 540, 65, 20, WHITE, 400, true) + display('CLAYMORES', 540, 229, 136, WHITE, 976, true) + display(`VS ${data.opponent}`.toUpperCase(), 540, 282, 27, PINK, 930, true))
    let background = rect(0, 0, WIDTH, HEIGHT, '#06080b')
    background += image(data.background, 20, 20, 1040, 1310, 'xMidYMid slice') + rect(20, 20, 1040, 1310, '#030509', data.background ? .77 : .25)
    background += '<rect x="20" y="20" width="1040" height="1310" fill="url(#smoke)"/>'
    background += display('CLAYMORES', 540, 170, 175, WHITE, 1020, true, .045) + display('CLAYMORES', 540, 1298, 175, WHITE, 1020, true, .045)
    for (let i = 0; i < 250; i++) {
        const x = 30 + (i * 97) % 1010, y = 20 + (i * 53) % 1310
        background += `<path d="M${x} ${y}l${8 + i % 43} -${i % 13}" stroke="#d6dce2" stroke-opacity=".04"/>`
    }
    for (const y of [165, 720, 1080]) for (const x of [0, 1064]) {
        background += rect(x, y, 16, 100, PINK, .52) + rect(x, y + 110, 16, 6, '#a9adb1', .7)
    }
    background += '<rect x="33" y="33" width="1014" height="1284" fill="none" stroke="#76808c" stroke-opacity=".2"/>'
    let content = group('background', background)
    if (data.template === 'finalScore') {
        content += group('score-headline', display('CLAYMORES R.F.C.', 540, 88, 24, WHITE, 550, true) + display(date, 540, 192, 49, WHITE, 900, true) + display('FINAL SCORE', 540, 327, 67, WHITE, 960, true))
        content += group('score', display(`${data.clubScore ?? '?'} - ${data.opponentScore ?? '?'}`, 540, 630, 248, WHITE, 940, true))
        content += group('team-crests', image(data.clubLogo, 177, 720, 176, 245) + (image(data.opponentLogo, 714, 720, 176, 245) || sans('OPPONENT CREST', 802, 840, 18, '#8493a0', true)))
        content += group('team-names', display('CLAYMORES', 265, 1020, 36, WHITE, 420, true) + display(data.opponent.toUpperCase(), 802, 1020, 36, WHITE, 420, true))
        content += group('competition-and-venue', display(data.competition.toUpperCase(), 540, 1130, 28, PINK, 950, true) + sans(data.venue.toUpperCase(), 540, 1192, 22, '#bdc5cd', true))
    } else {
        content += header()
        if (data.template === 'featured') {
            content += group('featured-player', playerImage(data.featured[0], 452, 315, 595, 850))
            content += '<rect x="42" y="310" width="604" height="854" fill="url(#shade)"/>'
            content += group('starting-xv', rows(Array.from({ length: 15 }, (_, i) => i + 1), 63, 360, 505, 34, 29))
            const subs = data.lineup.filter(p => p.number! >= 16).map(p => p.number!)
            if (subs.length) content += group('replacements', sans('REPLACEMENTS', 63, 888, 17, PINK) + rows(subs, 63, 925, 505, 28, 24))
            content += group('opponent-crest', image(data.opponentLogo, 886, 1078, 114, 114)) + footer()
        } else if (data.template === 'threePlayers') {
            content += group('featured-players', [0, 1, 2].map(i => playerImage(data.featured[i], 65 + i * 320, 313, 310, 387)).join(''))
            content += '<rect x="45" y="600" width="990" height="140" fill="url(#fade)"/>'
            content += group('forwards', display('FORWARDS', 63, 751, 40, PINK, 440) + rows([1, 2, 3, 4, 5, 6, 7, 8], 63, 796, 440, 38, 28))
            content += group('backs', display('BACKS', 594, 751, 40, BLUE, 430) + rows([9, 10, 11, 12, 13, 14, 15], 594, 796, 420, 38, 28))
            content += '<path d="M554 724V1082" stroke="#56616b" stroke-opacity=".45"/>'
            const subs = data.lineup.filter(p => p.number! >= 16)
            if (subs.length) content += group('replacements', sans('REPLACEMENTS', 63, 1127, 16, PINK) + subs.map((p, i) => display(`${p.number}. ${label(p)}`, 63 + i % 4 * 250, 1155 + Math.floor(i / 4) * 25, 18, WHITE, 236)).join(''))
            content += footer(1235)
        } else {
            content += '<path d="M72 318H1008V1120H72Z M72 710H1008" fill="none" stroke="#82909c" stroke-opacity=".25"/>'
            const pitchRows = [
                { ns: [1, 2, 3], y: 333 }, { ns: [4, 5], y: 474 }, { ns: [6, 8, 7], y: 615 },
                { ns: [9, 10], y: 756 }, { ns: [11, 12, 13, 14], y: 897 }, { ns: [15], y: 1018 },
            ]
            for (const { ns, y } of pitchRows) for (let i = 0; i < ns.length; i++) {
                const n = ns[i], x = 80 + 920 * (i + .5) / ns.length
                content += group(`position-${n}`, playerImage(playerAt(n), x - 44, y, 88, 90) + rect(x - 111, y + 91, 222, 31, '#07090c', .92) + display(`${n}. ${label(playerAt(n))}`, x, y + 113, 18, WHITE, 213, true))
            }
            const subs = data.lineup.filter(p => p.number! >= 16)
            if (subs.length) content += group('replacements', sans('REPLACEMENTS', 63, 1174, 16, PINK) + subs.map((p, i) => display(`${p.number}. ${label(p)}`, 63 + i % 4 * 250, 1202 + Math.floor(i / 4) * 25, 18, WHITE, 236)).join(''))
            content += group('match-details', sans(`${date} / ${data.kickoff} / ${data.venue}`.toUpperCase(), 540, 1280, 18, WHITE, true))
        }
    }
    content += sans('CENTRAL FLORIDA CLAYMORES RFC', 540, 1311, 12, '#84909b', true)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"><title>${escape(`Claymores ${data.template} — ${data.opponent}`)}</title><defs><radialGradient id="smoke" cx="65%" cy="42%" r="70%"><stop stop-color="#76808b" stop-opacity=".3"/><stop offset=".48" stop-color="#252d35" stop-opacity=".38"/><stop offset="1" stop-color="#020407" stop-opacity=".9"/></radialGradient><linearGradient id="shade"><stop stop-color="#06080b" stop-opacity=".96"/><stop offset=".8" stop-color="#06080b" stop-opacity=".64"/><stop offset="1" stop-color="#06080b" stop-opacity="0"/></linearGradient><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#06080b" stop-opacity="0"/><stop offset="1" stop-color="#06080b"/></linearGradient></defs>${content}</svg>`
}

export function formatGraphicDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'MATCH DATE'
    const parsed = new Date(`${date}T12:00:00Z`)
    if (Number.isNaN(parsed.getTime())) return 'MATCH DATE'
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed).toUpperCase()
}
