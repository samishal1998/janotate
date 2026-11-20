import React from 'react'
const paths = {
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  home: 'm3 10 9-7 9 7 M5 9v11h14V9 M10 20v-6h4v6',
  speaker: 'M4 9h4l5-4v14l-5-4H4z M16 9a5 5 0 0 1 0 6 M19 6a9 9 0 0 1 0 12',
  pause: 'M7 5h3v14H7z M14 5h3v14h-3z',
  stop: 'M6 6h12v12H6z',
  play: 'M7 4l13 8-13 8z',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevron-down': 'm6 9 6 6 6-6',
  fit: 'M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6',
  database:
    'M3 6c0-5 18-5 18 0s-18 5-18 0v12c0 5 18 5 18 0V6 M3 12c0 5 18 5 18 0',
  network: 'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4',
  code: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
  board: 'M3 4h18v16H3z M3 9h18 M9 9v11',
  log: 'M4 5h16v15H4z M8 9h8 M8 13h6',
  book: 'M12 6Q7 3 2 5v14q5-2 10 1 5-3 10-1V5q-5-2-10 1v14',
  item: 'M12 3l9 9-9 9-9-9z M9 12l2 2 4-4',
  chat: 'M4 4h16v12H9l-5 4z',
  arrow: 'M4 12h15 M14 6l6 6-6 6',
  workspace: 'M3 7h7l2 2h9v10H3z M3 7V5h7l2 2',
  check: 'M4 12l5 5L20 6',
  cpu: 'M6 6h12v12H6z M10 10h4v4h-4z M9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',
  layers: 'M12 3l10 5-10 5L2 8z M3 12l9 5 9-5 M3 16l9 5 9-5',
  spark: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  search: 'M15 9a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M14 14l6 6',
}
export function Icon({
  name,
  size = 16,
  ...props
}: {
  name: keyof typeof paths
  size?: number
} & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}

export function itemIcon(kind: string): keyof typeof paths {
  const icons: Record<string, keyof typeof paths> = {
    pr_review: 'code',
    lottie: 'play',
    diagram: 'network',
    dbml: 'database',
    code: 'code',
    diff: 'code',
    function_overview: 'code',
    proposal: 'book',
    plan: 'layers',
    range: 'board',
    scope_board: 'board',
    ranking: 'log',
    decision: 'item',
  }
  return icons[kind] ?? 'item'
}
