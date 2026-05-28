import { Database } from "@/storage/db"
import { SessionTable } from "@/session/session.sql"
import { type SessionID } from "@/session/schema"
import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { WeaveIdeaTable } from "./weave.sql"

export interface IdeaInfo {
  id: string
  run_id: string | null
  project_id: string
  session_id: string | null
  title: string
  hypothesis: string
  rationale: string | null
  status: string
  priority: number
  owner_agent: string | null
  linked_memory_json: string[] | null
  last_progress_at: number | null
  time_created: number
  time_updated: number
}

export interface Interface {
  readonly create: (input: {
    sessionID: SessionID
    runID?: string
    title: string
    hypothesis: string
    rationale?: string
    ownerAgent?: string
    priority?: number
    linkedMemoryIDs?: string[]
  }) => Effect.Effect<IdeaInfo>
  readonly list: (input: {
    sessionID: SessionID
    status?: "open" | "active" | "blocked" | "validated" | "discarded"
    ownerAgent?: string
    limit?: number
  }) => Effect.Effect<IdeaInfo[]>
  readonly update: (input: {
    sessionID: SessionID
    id: string
    status?: "open" | "active" | "blocked" | "validated" | "discarded"
    ownerAgent?: string
    linkedMemoryIDs?: string[]
  }) => Effect.Effect<IdeaInfo | null>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WeaveIdea") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const create = Effect.fn("WeaveIdea.create")(function* (input: {
      sessionID: SessionID
      runID?: string
      title: string
      hypothesis: string
      rationale?: string
      ownerAgent?: string
      priority?: number
      linkedMemoryIDs?: string[]
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return yield* Effect.die(`session not found: ${input.sessionID}`)
      const now = Date.now()
      const id = `widea_${crypto.randomUUID()}`
      yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .insert(WeaveIdeaTable)
            .values({
              id,
              run_id: input.runID,
              project_id: session.project_id,
              session_id: input.sessionID,
              title: input.title,
              hypothesis: input.hypothesis,
              rationale: input.rationale,
              status: "open",
              priority: Math.max(0, Math.min(input.priority ?? 50, 100)),
              owner_agent: input.ownerAgent,
              linked_memory_json: input.linkedMemoryIDs,
              time_created: now,
              time_updated: now,
            })
            .run(),
        ),
      )
      const created = yield* Effect.sync(() => Database.use((db) => db.select().from(WeaveIdeaTable).where(eq(WeaveIdeaTable.id, id)).get()))
      if (!created) return yield* Effect.die(`weave idea not created: ${id}`)
      return created
    })

    const list = Effect.fn("WeaveIdea.list")(function* (input: {
      sessionID: SessionID
      status?: "open" | "active" | "blocked" | "validated" | "discarded"
      ownerAgent?: string
      limit?: number
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return []
      return yield* Effect.sync(() =>
        Database.use((db) => {
          const conditions = [eq(WeaveIdeaTable.project_id, session.project_id)]
          if (input.status) conditions.push(eq(WeaveIdeaTable.status, input.status))
          if (input.ownerAgent) conditions.push(eq(WeaveIdeaTable.owner_agent, input.ownerAgent))
          return db
            .select()
            .from(WeaveIdeaTable)
            .where(and(...conditions))
            .orderBy(desc(WeaveIdeaTable.priority), desc(WeaveIdeaTable.time_updated))
            .limit(Math.max(1, Math.min(input.limit ?? 20, 100)))
            .all()
        }),
      )
    })

    const update = Effect.fn("WeaveIdea.update")(function* (input: {
      sessionID: SessionID
      id: string
      status?: "open" | "active" | "blocked" | "validated" | "discarded"
      ownerAgent?: string
      linkedMemoryIDs?: string[]
    }) {
      const session = yield* Effect.sync(() =>
        Database.use((db) => db.select({ project_id: SessionTable.project_id }).from(SessionTable).where(eq(SessionTable.id, input.sessionID)).get()),
      )
      if (!session) return null
      const patch: {
        status?: "open" | "active" | "blocked" | "validated" | "discarded"
        owner_agent?: string
        linked_memory_json?: string[]
        last_progress_at?: number
        time_updated: number
      } = {
        time_updated: Date.now(),
      }
      if (input.status) patch.status = input.status
      if (input.ownerAgent) patch.owner_agent = input.ownerAgent
      if (input.linkedMemoryIDs) patch.linked_memory_json = input.linkedMemoryIDs
      if (input.status && ["active", "validated"].includes(input.status)) patch.last_progress_at = Date.now()
      yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .update(WeaveIdeaTable)
            .set(patch)
            .where(and(eq(WeaveIdeaTable.id, input.id), eq(WeaveIdeaTable.project_id, session.project_id)))
            .run(),
        ),
      )
      return yield* Effect.sync(() =>
        Database.use((db) =>
          db
            .select()
            .from(WeaveIdeaTable)
            .where(and(eq(WeaveIdeaTable.id, input.id), eq(WeaveIdeaTable.project_id, session.project_id)))
            .get(),
        ),
      )
    })

    return Service.of({ create, list, update })
  }),
)

export const defaultLayer = layer

export * as WeaveIdea from "./idea"
