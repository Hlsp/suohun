import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { WeaveMemory } from "@/weave/memory"
import { WeaveEvent } from "@/weave/event"

const Trust = Schema.Literal("candidate", "verified", "rejected", "stale")

export const Parameters = Schema.Struct({
  action: Schema.Literal("add", "list", "promote", "reject", "mark_stale"),
  scope: Schema.optional(Schema.Literal("global", "project", "target", "session")),
  kind: Schema.optional(Schema.Literal("fact", "constraint", "indicator", "finding", "artifact")),
  content: Schema.optional(Schema.String),
  target: Schema.optional(Schema.String),
  evidence: Schema.optional(Schema.Array(Schema.String)),
  confidence: Schema.optional(Schema.Number),
  tags: Schema.optional(Schema.Array(Schema.String)),
  id: Schema.optional(Schema.String),
  trust: Schema.optional(Trust),
  query: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
})

type Metadata = {
  action: string
  count?: number
  id?: string
}

export const WeaveMemoryTool = Tool.define<typeof Parameters, Metadata, WeaveMemory.Service | WeaveEvent.Service>(
  "weave_memory",
  Effect.gen(function* () {
    const memory = yield* WeaveMemory.Service
    const event = yield* WeaveEvent.Service

    return {
      description:
        "Manage durable weave memory entries for project/session investigation context. Supports add/list and trust state transitions.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "weave_memory",
            patterns: ["*"],
            always: ["*"],
            metadata: { action: params.action },
          })

          if (params.action === "add") {
            if (!params.content?.trim()) {
              return {
                title: "Invalid Arguments",
                output: "`content` is required when action is `add`.",
                metadata: { action: params.action },
              }
            }
            const created = yield* memory.add({
              sessionID: ctx.sessionID,
              scope: params.scope ?? "project",
              kind: params.kind ?? "fact",
              content: params.content,
              target: params.target,
              evidence: params.evidence,
              sourceAgent: ctx.agent,
              confidence: params.confidence,
              trust: params.trust,
              tags: params.tags,
            })
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "solver",
              type: "memory.add",
              payload: {
                id: created.id,
                scope: created.scope,
                kind: created.kind,
                trust: created.trust,
              },
            })
            return {
              title: "Memory Added",
              output: JSON.stringify(created, null, 2),
              metadata: { action: params.action, id: created.id },
            }
          }

          if (params.action === "list") {
            const rows = yield* memory.list({
              sessionID: ctx.sessionID,
              scope: params.scope,
              trust: params.trust,
              query: params.query,
              limit: params.limit,
            })
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "observer",
              type: "memory.list",
              payload: {
                count: rows.length,
                scope: params.scope,
                trust: params.trust,
                query: params.query,
              },
            })
            return {
              title: `${rows.length} memories`,
              output: JSON.stringify(rows, null, 2),
              metadata: { action: params.action, count: rows.length },
            }
          }

          if (!params.id?.trim()) {
            return {
              title: "Invalid Arguments",
              output: "`id` is required for promote/reject/mark_stale actions.",
              metadata: { action: params.action },
            }
          }

          const trust =
            params.action === "promote"
              ? "verified"
              : params.action === "reject"
                ? "rejected"
                : params.trust ?? "stale"
          const updated = yield* memory.setTrust({
            sessionID: ctx.sessionID,
            id: params.id,
            trust,
          })
          if (updated) {
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "manager",
              type: "memory.trust",
              payload: {
                id: updated.id,
                trust: updated.trust,
                action: params.action,
              },
            })
          }
          return {
            title: updated ? "Memory Updated" : "Memory Not Found",
            output: JSON.stringify(updated, null, 2),
            metadata: { action: params.action, id: params.id },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
