import type { ReviewStore } from './store.ts'
export function reviewService(
  workspace: ReviewStore,
  temporary: ReviewStore,
  session: boolean,
  publicOrigin: () => string,
) {
  function locate(id: string) {
    return temporary.has(id) ? temporary : workspace
  }

  async function dispatch(name, args, progress, signal) {
    if (name === 'decisions_query') return { decisions: workspace.query(args) }
    if (name === 'review_open') {
      const mode = args.mode ?? (session ? 'session' : 'workspace')
      const store = mode === 'workspace' ? workspace : temporary
      const r = store.open(args.title, args.items, mode, args.ttl_hours)
      return { ...r, url: publicOrigin() + '/review/' + r.review_id }
    }
    const id = args.review_id,
      store = locate(id)
    if (name === 'discussion_reply')
      return store.reply(id, args.item_id, args.parent_id, args.reply)
    if (name === 'item_update')
      return store.update(
        id,
        args.item_id,
        args.patch,
        args.reply,
        args.parent_id,
      )
    if (name === 'review_get') {
      const r = store.result(id)
      return r.state === 'open' ? { ...r, review: store.get(id) } : r
    }
    function counts() {
      const r = store.get(id),
        answered = r.items.filter((i) => i.value !== undefined).length,
        total = r.items.length
      const skipped =
        r.state === 'done'
          ? total - answered
          : r.items.filter((i) => i.skipped).length
      return {
        asked: total - answered - skipped,
        answered,
        skipped,
        last_activity: r.submitted_at ?? r.last_activity,
        total,
      }
    }
    if (name === 'review_status') return counts()
    const start = Date.now(),
      end = start + args.wait_seconds * 1000
    let heartbeat = start + 5000
    while (true) {
      if (store.state(id) !== 'open') return store.result(id)
      if (args.after_comment !== undefined) {
        const comments = store.reviewerComments(id, args.after_comment)
        if (comments.length)
          return {
            state: 'discussion',
            comments,
            cursor: comments.at(-1).cursor,
          }
      }
      if (Date.now() >= end) break
      await store.waitForChange(
        id,
        Math.max(0, Math.min(heartbeat, end) - Date.now()),
        signal,
      )
      if (Date.now() >= heartbeat) {
        await progress(Math.floor((Date.now() - start) / 1000))
        heartbeat += 5000
      }
    }
    const latest = store.result(id)
    if (latest.state !== 'open') return latest
    const { answered, total } = counts()
    return { state: 'pending', answered, total }
  }
  return { dispatch, locate }
}
