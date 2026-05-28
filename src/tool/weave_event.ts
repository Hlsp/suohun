import { WeaveEvent } from "@/weave/event"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  action: Schema.Literal("append", "list"),
  role: Schema.optional(Schema.Literal("manager", "solver", "observer", "system")),
  type: Schema.optional(Schema.String),
  run_id: Schema.optional(Schema.String),
  payload: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  limit: Schema.optional(Schema.Number),
})

type Metadata = {
  action: string
  count?: number
  id?: string
}

export const WeaveEventTool = Tool.define<typeof Parameters, Metadata, WeaveEvent.Service>(
  "weave_event",
  Effect.gen(function* () {
    const event = yield* WeaveEvent.Service

    return {
      description:
        "Record and query weave timeline events for manager/solver/observer coordination. Supports append/list actions.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "weave_event",
            patterns: ["*"],
            always: ["*"],
            metadata: { action: params.action },
          })

          if (params.action === "append") {
            if (!params.role || !params.type?.trim()) {
              return {
                title: "Invalid Arguments",
                output: "`role` and `type` are required when action is `append`.",
                metadata: { action: params.action },
              }
            }
            const created = yield* event.append({
              sessionID: ctx.sessionID,
              runID: params.run_id,
              role: params.role,
              type: params.type,
              payload: params.payload,
            })
            return {
              title: "Event Appended",
              output: JSON.stringify(created, null, 2),
              metadata: { action: params.action, id: created.id },
            }
          }

          const rows = yield* event.list({
            sessionID: ctx.sessionID,
            role: params.role,
            type: params.type,
            limit: params.limit,
          })
          return {
            title: `${rows.length} events`,
            output: JSON.stringify(rows, null, 2),
            metadata: { action: params.action, count: rows.length },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
