import React from 'react'
import { graph } from '../../core/src/catalog'
export function Diagram({ spec, anchor }) {
  const { nodes, edges, horizontal } = graph(spec)
  const depth = new Map<string, number>()
  // Breadth-first placement also terminates for cycles and disconnected graphs.
  const place = (root: string) => {
    if (depth.has(root)) return
    depth.set(root, 0)
    const queue = [root]
    for (let i = 0; i < queue.length; i++) {
      const from = queue[i]
      for (const [a, b] of edges)
        if (a === from && !depth.has(b)) {
          depth.set(b, depth.get(a) + 1)
          queue.push(b)
        }
    }
  }
  for (const [id] of nodes)
    if (!edges.some(([, target]) => target === id)) place(id)
  for (const [id] of nodes) place(id)
  const rows = new Map(),
    points = new Map()
  for (const [id] of nodes) {
    const level = depth.get(id),
      lane = rows.get(level) ?? 0
    rows.set(level, lane + 1)
    points.set(id, {
      x: 88 + (horizontal ? level : lane) * 210,
      y: 35 + (horizontal ? lane : level) * 86,
    })
  }
  const width = Math.max(...Array.from(points.values(), (p) => p.x)) + 88,
    height = Math.max(...Array.from(points.values(), (p) => p.y)) + 35
  function control(path, label) {
    const select = () => anchor({ type: 'node', path })
    return {
      role: 'button',
      tabIndex: 0,
      'aria-label': label,
      onClick: select,
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      },
    }
  }
  return (
    <div className="diagram">
      <svg width={width} height={height} aria-label="Flowchart">
        {edges.map(([a, b], n) => {
          const p = points.get(a),
            q = points.get(b),
            right = q.x > p.x,
            down = q.y > p.y
          const x1 = horizontal ? p.x + (right ? 75 : -75) : p.x,
            y1 = horizontal ? p.y : p.y + (down ? 20 : -20)
          const x2 = horizontal ? q.x + (right ? -75 : 75) : q.x,
            y2 = horizontal ? q.y : q.y + (down ? -20 : 20)
          const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
          return (
            <g key={n} {...control('edge:' + a + '->' + b, a + ' to ' + b)}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="transparent"
                strokeWidth="14"
              />
              <path
                d="M0 0 L-8 -4 L-8 4 Z"
                transform={
                  'translate(' + x2 + ' ' + y2 + ') rotate(' + angle + ')'
                }
                fill="currentColor"
              />
            </g>
          )
        })}
        {nodes.map(([id, label]) => {
          const p = points.get(id)
          return (
            <g key={id} {...control('node:' + id, label)}>
              <title>{label}</title>
              <rect x={p.x - 75} y={p.y - 20} width="150" height="40" rx="4" />
              <text
                x={p.x}
                y={p.y}
                dominantBaseline="central"
                textAnchor="middle"
              >
                {label.length > 17 ? label.slice(0, 16) + '…' : label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
