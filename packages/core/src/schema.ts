import {z} from 'zod'
const text=z.string().trim().min(1).max(10000)
const option=z.object({id:text,label:text,tradeoffs:text,recommended:z.boolean().optional()})
export const decision=z.object({
  kind:z.literal('decision'),title:text,options:z.array(option).min(1).max(100),
  status:z.enum(['asked','defaulted']).optional(),default:text.optional(),allow_other:z.boolean().default(true),
  source:z.object({by:z.enum(['user','agent']),basis:z.enum(['stated','inferred','unverified']).optional()}).optional(),
  evidence:z.array(z.object({label:text,url:z.url({protocol:/^https?$/}).optional()})).optional()
}).refine(i=>new Set(i.options.map(o=>o.id)).size===i.options.length && i.options.filter(o=>o.recommended).length<=1,{path:['options'],message:'Options need distinct ids and at most one recommendation'})
export const tools={
  review_open:z.object({title:text,items:z.array(decision).min(1).max(100),mode:z.enum(['workspace','session']).optional(),ttl_hours:z.number().positive().max(87600).optional()}),
  review_get:z.object({review_id:z.uuid()}),review_status:z.object({review_id:z.uuid()}),
  review_wait:z.object({review_id:z.uuid(),wait_seconds:z.number().int().min(1).max(45).default(45)})
}
export const submission=z.record(z.uuid(),z.union([z.object({option:text}),z.object({other:text})]))
