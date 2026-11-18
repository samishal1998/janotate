import {z} from 'zod'
const text=z.string().trim().min(1).max(10000)
const option=z.object({id:text,label:text,tradeoffs:text,recommended:z.boolean().optional()})
export const decision=z.object({
  kind:z.literal('decision'),title:text,options:z.array(option).min(1).max(100),
  status:z.enum(['asked','defaulted']).optional(),default:text.optional(),allow_other:z.boolean().default(true),
  source:z.object({by:z.enum(['user','agent']),basis:z.enum(['stated','inferred','unverified']).optional()}).optional(),
  evidence:z.array(z.object({label:text,url:z.url({protocol:/^https?$/}).optional()})).optional()
}).refine(i=>new Set(i.options.map(o=>o.id)).size===i.options.length && i.options.filter(o=>o.recommended).length<=1,{path:['options'],message:'Options need distinct ids and at most one recommendation'})
const fields={title:text,source:decision.shape.source,evidence:decision.shape.evidence}
const claim=z.object({...fields,kind:z.literal('claim'),claims:z.array(z.object({id:text,label:text,evidence:text.optional()})).min(1)})
const defaults=z.object({...fields,kind:z.literal('defaults'),defaults:z.array(z.object({id:text,label:text,value:text})).min(1)})
const html=z.object({...fields,kind:z.literal('html'),html:z.string().max(200000),expects:z.object({type:z.literal('object'),properties:z.record(z.string(),z.unknown())}).passthrough()})
export const itemSchema=z.union([decision,claim,defaults,html])
export const tools={
  item_update:z.object({review_id:z.uuid(),item_id:z.uuid(),patch:z.record(z.string(),z.unknown()),reply:text,parent_id:z.uuid().optional()}),
  review_open:z.object({title:text,items:z.array(itemSchema).min(1).max(100),mode:z.enum(['workspace','session']).optional(),ttl_hours:z.number().positive().max(87600).optional()}),
  review_get:z.object({review_id:z.uuid()}),review_status:z.object({review_id:z.uuid()}),
  review_wait:z.object({review_id:z.uuid(),wait_seconds:z.number().int().min(1).max(45).default(45)})
}
export const submission=z.record(z.uuid(),z.union([z.object({option:text}),z.object({other:text}),z.object({values:z.record(text,text)})]))
export const anchor=z.discriminatedUnion('type',[
  z.object({type:z.literal('item')}),
  z.object({type:z.literal('node'),path:text}),
  z.object({type:z.literal('text'),exact:text,prefix:z.string(),suffix:z.string()})
])
export const commentInput=z.object({body:text,anchor,parent_id:z.uuid().optional()})
