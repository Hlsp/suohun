import { Database } from "@/storage/db"
import { SessionTable } from "@/session/session.sql"
import { type SessionID } from "@/session/schema"
import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { WeaveEventTable } from "./weave.sql"

export interface EventInfo {
  id: string
  run_id: string | null
  session_id: string
  agent: string | null
  role: string
  type: string
  payload_json: Record<string, unknown> | null
  time_created: number
  time_updated: number
}

export interface Interface {
  readonly append: (input: {
    sessionID: SessionID
    runID?: string
    role: "manager" | "solver" | "observer" | "system"
    type: string
    payload?: Record<string, unknown>
  }) => Effect.Effect<EventInfo>
  readonly list: (input: { sessionID: SessionID; role?: string; type?: string; limit?: number }) => Effect.Effect<EventInfo[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WeaveEvent") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const append = Effect.fn("WeaveEvent.append")(function* (input: {
      sessionID: SessionID
      runID?: string
      role: "manager" | "solver" | "observer" | "system"
      type: string
      payload?: Record<string, unknown>
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) =>
          db.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get(),
        ),
      )
      if (!session) return yield* Effect.die(`session not found: ${input.sessionID}`)
      const now = Date.now()
      const id = `wevt_${crypto.randomUUID()}`
      yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .insert(WeaveEventTable)
            .values({
              id,
              run_id: input.runID,
              session_id: input.sessionID,
              agent: null,
              role: input.role,
              type: input.type,
              payload_json: input.payload,
              time_created: now,
              time_updated: now,
            })
            .run(),
        ),
      )
      const created = yield* Effect.sync(() => Database.use((db) => db.select().from(WeaveEventTable).where(eq(WeaveEventTable.id, id)).get()))
      if (!created) return yield* Effect.die(`weave event not created: ${id}`)
      return created
    })

    const list = Effect.fn("WeaveEvent.list")(function* (input: {
      sessionID: SessionID
      role?: string
      type?: string
      limit?: number
    }) {
      const conditions = [eq(WeaveEventTable.session_id, input.sessionID)]
      if (input.role) conditions.push(eq(WeaveEventTable.role, input.role))
      if (input.type) conditions.push(eq(WeaveEventTable.type, input.type))
      return yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(WeaveEventTable)
            .where(and(...conditions))
            .orderBy(desc(WeaveEventTable.time_created))
            .limit(Math.max(1, Math.min(input.limit ?? 50, 200)))
            .all(),
        ),
      )
    })

    return Service.of({ append, list })
  }),
)

export const defaultLayer = layer

export * as WeaveEvent from "./event"
