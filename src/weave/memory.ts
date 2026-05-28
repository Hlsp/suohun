import { Database } from "@/storage/db"
import { SessionTable } from "@/session/session.sql"
import { type SessionID } from "@/session/schema"
import { and, desc, eq, like } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { WeaveMemoryTable } from "./weave.sql"

export interface MemoryInfo {
  id: string
  project_id: string
  scope: string
  session_id: string | null
  target: string | null
  kind: string
  content: string
  evidence_json: string[] | null
  source_agent: string | null
  confidence: number
  trust: string
  tags_json: string[] | null
  time_created: number
  time_updated: number
}

export interface Interface {
  readonly add: (input: {
    sessionID: SessionID
    scope: "project" | "target" | "session" | "global"
    target?: string
    kind: "fact" | "constraint" | "indicator" | "finding" | "artifact"
    content: string
    evidence?: string[]
    sourceAgent?: string
    confidence?: number
    trust?: "candidate" | "verified" | "rejected" | "stale"
    tags?: string[]
  }) => Effect.Effect<MemoryInfo>
  readonly list: (input: {
    sessionID: SessionID
    scope?: "project" | "target" | "session" | "global"
    trust?: "candidate" | "verified" | "rejected" | "stale"
    query?: string
    limit?: number
  }) => Effect.Effect<MemoryInfo[]>
  readonly setTrust: (input: {
    sessionID: SessionID
    id: string
    trust: "candidate" | "verified" | "rejected" | "stale"
  }) => Effect.Effect<MemoryInfo | null>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WeaveMemory") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const add = Effect.fn("WeaveMemory.add")(function* (input: {
      sessionID: SessionID
      scope: "project" | "target" | "session" | "global"
      target?: string
      kind: "fact" | "constraint" | "indicator" | "finding" | "artifact"
      content: string
      evidence?: string[]
      sourceAgent?: string
      confidence?: number
      trust?: "candidate" | "verified" | "rejected" | "stale"
      tags?: string[]
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return yield* Effect.die(`session not found: ${input.sessionID}`)
      const now = Date.now()
      const id = `wmem_${crypto.randomUUID()}`
      yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .insert(WeaveMemoryTable)
            .values({
              id,
              project_id: session.project_id,
              scope: input.scope,
              session_id: input.scope === "session" ? input.sessionID : null,
              target: input.target,
              kind: input.kind,
              content: input.content,
              evidence_json: input.evidence,
              source_agent: input.sourceAgent,
              confidence: input.confidence ?? 50,
              trust: input.trust ?? "candidate",
              tags_json: input.tags,
              time_created: now,
              time_updated: now,
            })
            .run(),
        ),
      )
      const created = yield* Effect.sync(() => Database.use((db) => db.select().from(WeaveMemoryTable).where(eq(WeaveMemoryTable.id, id)).get()))
      if (!created) return yield* Effect.die(`weave memory not created: ${id}`)
      return created
    })

    const list = Effect.fn("WeaveMemory.list")(function* (input: {
      sessionID: SessionID
      scope?: "project" | "target" | "session" | "global"
      trust?: "candidate" | "verified" | "rejected" | "stale"
      query?: string
      limit?: number
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return []
      return yield* Effect.sync(() =>
        Database.use((db) => {
          const conditions = [eq(WeaveMemoryTable.project_id, session.project_id)]
          if (input.scope) conditions.push(eq(WeaveMemoryTable.scope, input.scope))
          if (input.trust) conditions.push(eq(WeaveMemoryTable.trust, input.trust))
          if (input.query?.trim()) conditions.push(like(WeaveMemoryTable.content, `%${input.query.trim()}%`))
          return db
            .select()
            .from(WeaveMemoryTable)
            .where(and(...conditions))
            .orderBy(desc(WeaveMemoryTable.time_updated))
            .limit(Math.max(1, Math.min(input.limit ?? 20, 100)))
            .all()
        }),
      )
    })

    const setTrust = Effect.fn("WeaveMemory.setTrust")(function* (input: {
      sessionID: SessionID
      id: string
      trust: "candidate" | "verified" | "rejected" | "stale"
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return null
      yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .update(WeaveMemoryTable)
            .set({ trust: input.trust, time_updated: Date.now() })
            .where(and(eq(WeaveMemoryTable.id, input.id), eq(WeaveMemoryTable.project_id, session.project_id)))
            .run(),
        ),
      )
      return yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(WeaveMemoryTable)
            .where(and(eq(WeaveMemoryTable.id, input.id), eq(WeaveMemoryTable.project_id, session.project_id)))
            .get(),
        ),
      )
    })

    return Service.of({ add, list, setTrust })
  }),
)

export const defaultLayer = layer

export * as WeaveMemory from "./memory"
