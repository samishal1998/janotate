import React, { useContext, useMemo, useRef, useEffect } from 'react'
import {
  ReactFlow,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type ReactFlowInstance,
  type Node,
} from '@xyflow/react'
import dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'
import { Icon } from './components/icon'
import { AnnotationMode } from './annotation-tool'
export type GraphNode = {
  id: string
  label: string
  kind?: string
  tone?: number
  detail?: string
  height?: number
  fields?: { name: string; type: string; path: string; state?: string }[]
}
export type GraphEdge = {
  id: string
  from: string
  to: string
  label?: string
  sourcePort?: string
  targetPort?: string
  cardinality?: string
}
const Selection = React.createContext({
  selected: '',
  highlighted: [] as readonly string[],
  pick: (_path: string) => {},
})
function Resource({ data }: { data: GraphNode & { horizontal: boolean } }) {
  const { selected, highlighted, pick } = useContext(Selection)
  return (
    <div
      className={'graph-card' + (data.fields ? ' entity' : '')}
      data-tone={data.tone ?? 0}
      data-walkthrough-active={highlighted.includes(data.id) || undefined}
      data-selected={
        selected === data.id || data.fields?.some((f) => f.path === selected)
      }
      style={{ height: data.height ?? 58 }}
    >
      <Handle
        type="target"
        id="in"
        position={data.horizontal ? Position.Left : Position.Top}
        isConnectable={false}
      />
      <div className="graph-card-head">
        <Icon
          name={
            data.fields ? 'database' : data.kind === 'Job' ? 'code' : 'network'
          }
        />
        <div>
          {data.kind && !data.fields && <small>{data.kind}</small>}
          <strong>{data.label}</strong>
        </div>
      </div>
      {data.fields?.map((f) => (
        <button
          key={f.path}
          className="graph-field nodrag nopan"
          aria-label={'Select column ' + f.path.slice(6)}
          aria-pressed={selected === f.path}
          onClick={(e) => {
            e.stopPropagation()
            pick(f.path)
          }}
        >
          <b>{f.name}</b>
          {f.state && <i title={f.state}>{f.state === 'Added' ? '+' : 'Δ'}</i>}
          <span>{f.type}</span>
        </button>
      ))}
      {data.fields?.flatMap((f, n) => [
        <Handle
          key={'in' + f.path}
          type="target"
          id={'in:' + f.path}
          position={Position.Left}
          style={{ top: 44 + n * 24 }}
          isConnectable={false}
        />,
        <Handle
          key={'out' + f.path}
          type="source"
          id={'out:' + f.path}
          position={Position.Right}
          style={{ top: 44 + n * 24 }}
          isConnectable={false}
        />,
      ])}
      <Handle
        type="source"
        id="out"
        position={data.horizontal ? Position.Right : Position.Bottom}
        isConnectable={false}
      />
    </div>
  )
}
const types = { resource: Resource }
export default function GraphCanvas({
  nodes,
  edges,
  horizontal = false,
  selected,
  onSelect,
  label,
  highlighted = [],
  playing = false,
  children,
}: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  horizontal?: boolean
  selected?: string
  onSelect: (id: string) => void
  label: string
  highlighted?: readonly string[]
  playing?: boolean
  children?: React.ReactNode
}) {
  const annotating = useContext(AnnotationMode)
  const host = useRef<HTMLDivElement>(null),
    [expanded, setExpanded] = React.useState(false)
  const api = useRef<ReactFlowInstance>(null)
  useEffect(() => {
    function fullscreen() {
      setExpanded(document.fullscreenElement === host.current)
    }
    const observer = new ResizeObserver((entries) => {
      if (entries[0].contentRect.width > 0)
        api.current?.fitView({ padding: 18, maxZoom: 1.2 })
    })
    observer.observe(host.current)
    document.addEventListener('fullscreenchange', fullscreen)
    return () => {
      observer.disconnect()
      document.removeEventListener('fullscreenchange', fullscreen)
    }
  }, [])
  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
      .setGraph({ rankdir: horizontal ? 'LR' : 'TB', ranksep: 42, nodesep: 26 })
      .setDefaultEdgeLabel(() => ({}))
    for (const n of nodes)
      g.setNode(n.id, { width: 192, height: n.height ?? 58 })
    for (const e of edges) g.setEdge(e.from, e.to)
    dagre.layout(g)
    return nodes.map((n) => ({
      id: n.id,
      type: 'resource',
      data: { ...n, horizontal },
      ariaLabel: 'Graph node ' + n.label,
      position: {
        x: g.node(n.id).x - 96,
        y: g.node(n.id).y - (n.height ?? 58) / 2,
      },
    })) as Node[]
  }, [nodes, edges, horizontal])
  const [placed, setPlaced, onNodesChange] = useNodesState(layout)
  useEffect(() => {
    setPlaced(layout)
    const frame = requestAnimationFrame(() =>
      api.current?.fitView({ padding: 18, maxZoom: 1.2 }),
    )
    return () => cancelAnimationFrame(frame)
  }, [layout])
  const lines = useMemo(
    () =>
      edges.map((e) => {
        const active = highlighted.includes(e.id)
        const color =
          selected === e.id
            ? 'var(--accent)'
            : active
              ? 'var(--stage-teal)'
              : 'var(--muted)'
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          sourceHandle: e.sourcePort ?? 'out',
          targetHandle: e.targetPort ?? 'in',
          label: e.cardinality,
          type: 'smoothstep',
          className: active ? 'walkthrough-edge' : undefined,
          ariaLabel: e.label ?? e.id,
          style: {
            stroke: color,
            strokeWidth: selected === e.id || active ? 3 : 1.7,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        }
      }),
    [edges, selected, highlighted],
  )
  return (
    <Selection.Provider value={{ selected, highlighted, pick: onSelect }}>
      <div
        className="graph-surface"
        ref={host}
        data-walkthrough={children ? true : undefined}
        data-walkthrough-playing={playing || undefined}
      >
        {children}
        <div className="graph-viewport" aria-label={label}>
          <ReactFlow
            nodes={placed}
            edges={lines}
            nodeTypes={types}
            onNodesChange={onNodesChange}
            onInit={(instance) => {
              api.current = instance
            }}
            fitView
            fitViewOptions={{ padding: 18, maxZoom: 1.2 }}
            minZoom={0.12}
            maxZoom={2.5}
            nodesConnectable={false}
            nodesDraggable={!annotating}
            deleteKeyCode={null}
            zoomOnScroll={false}
            preventScrolling={false}
            attributionPosition="bottom-left"
            onNodeClick={(_, n) => onSelect(n.id)}
            onEdgeClick={(_, e) => onSelect(e.id)}
          />
        </div>
        <div className="graph-tools" role="group" aria-label="Diagram controls">
          <button aria-label="Zoom out" onClick={() => api.current?.zoomOut()}>
            −
          </button>
          <button aria-label="Zoom in" onClick={() => api.current?.zoomIn()}>
            +
          </button>
          <button
            aria-label="Fit diagram"
            onClick={() => api.current?.fitView({ padding: 18, maxZoom: 1.2 })}
          >
            <Icon name="fit" /> Fit
          </button>
          {document.fullscreenEnabled && (
            <button
              aria-label={
                expanded ? 'Exit fullscreen diagram' : 'Expand diagram'
              }
              onClick={() => {
                const action = expanded
                  ? document.exitFullscreen()
                  : host.current.requestFullscreen()
                action.catch(() => {})
              }}
            >
              {expanded ? 'Close' : 'Expand'}
            </button>
          )}
        </div>
      </div>
    </Selection.Provider>
  )
}
