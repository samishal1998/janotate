import React, { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ReadAloudProvider,
  usePlaybackNarration,
} from '../../packages/ui/src/read-aloud'

const probe = (window['narrationProbe'] = {
  readers: {},
  events: [] as string[],
  unmountFirst: () => {},
})

function Reader({ id }) {
  const reader = usePlaybackNarration()
  useLayoutEffect(() => {
    probe.readers[id] = reader
    return () => {
      delete probe.readers[id]
    }
  }, [id, reader])
  return <output id={id}>{reader.phase}</output>
}

function Fixture() {
  const [first, setFirst] = useState(true)
  probe.unmountFirst = () => setFirst(false)
  return (
    <ReadAloudProvider reviewId="test" destination="items" visit={null}>
      {first && <Reader id="a" />}
      <Reader id="b" />
    </ReadAloudProvider>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
