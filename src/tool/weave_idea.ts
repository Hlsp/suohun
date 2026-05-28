import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { WeaveIdea } from "@/weave/idea"
import { WeaveEvent } from "@/weave/event"

export const Parameters = Schema.Struct({
  action: Schema.Literal("create", "list", "claim", "set_status", "link_memory"),
  id: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  hypothesis: Schema.optional(Schema.String),
  rationale: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Literal("open", "active", "blocked", "validated", "discarded")),
  owner_agent: Schema.optional(Schema.String),
  linked_memory_ids: Schema.optional(Schema.Array(Schema.String)),
  priority: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number),
})

type Metadata = {
  action: string
  count?: number
  id?: string
}

export const WeaveIdeaTool = Tool.define<typeof Parameters, Metadata, WeaveIdea.Service | WeaveEvent.Service>(
  "weave_idea",
  Effect.gen(function* () {
    const idea = yield* WeaveIdea.Service
    const event = yield* WeaveEvent.Service

    return {
      description:
        "Manage weave hypothesis and experiment ideas for active investigations. Supports creation, ownership, status flow, and memory linking.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "weave_idea",
            patterns: ["*"],
            always: ["*"],
            metadata: { action: params.action },
          })

          if (params.action === "create") {
            if (!params.title?.trim() || !params.hypothesis?.trim()) {
              return {
                title: "Invalid Arguments",
                output: "`title` and `hypothesis` are required when action is `create`.",
                metadata: { action: params.action },
              }
            }
            const created = yield* idea.create({
              sessionID: ctx.sessionID,
              title: params.title,
              hypothesis: params.hypothesis,
              rationale: params.rationale,
              ownerAgent: params.owner_agent ?? ctx.agent,
              priority: params.priority,
              linkedMemoryIDs: params.linked_memory_ids,
            })
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "solver",
              type: "idea.create",
              payload: {
                id: created.id,
                title: created.title,
                status: created.status,
                priority: created.priority,
              },
            })
            return {
              title: "Idea Created",
              output: JSON.stringify(created, null, 2),
              metadata: { action: params.action, id: created.id },
            }
          }

          if (params.action === "list") {
            const rows = yield* idea.list({
              sessionID: ctx.sessionID,
              status: params.status,
              ownerAgent: params.owner_agent,
              limit: params.limit,
            })
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "observer",
              type: "idea.list",
              payload: {
                count: rows.length,
                status: params.status,
                owner_agent: params.owner_agent,
              },
            })
            return {
              title: `${rows.length} ideas`,
              output: JSON.stringify(rows, null, 2),
              metadata: { action: params.action, count: rows.length },
            }
          }

          if (!params.id?.trim()) {
            return {
              title: "Invalid Arguments",
              output: "`id` is required for claim/set_status/link_memory actions.",
              metadata: { action: params.action },
            }
          }

          if (params.action === "set_status" && !params.status) {
            return {
              title: "Invalid Arguments",
              output: "`status` is required when action is `set_status`.",
              metadata: { action: params.action, id: params.id },
            }
          }

          if (params.action === "link_memory" && !params.linked_memory_ids?.length) {
            return {
              title: "Invalid Arguments",
              output: "`linked_memory_ids` is required when action is `link_memory`.",
              metadata: { action: params.action, id: params.id },
            }
          }

          const updated = yield* idea.update({
            sessionID: ctx.sessionID,
            id: params.id,
            status: params.action === "set_status" ? params.status : undefined,
            ownerAgent: params.action === "claim" ? (params.owner_agent ?? ctx.agent) : undefined,
            linkedMemoryIDs: params.action === "link_memory" ? (params.linked_memory_ids ?? []) : undefined,
          })
          if (updated) {
            yield* event.append({
              sessionID: ctx.sessionID,
              role: "manager",
              type: "idea.update",
              payload: {
                id: updated.id,
                action: params.action,
                status: updated.status,
                owner_agent: updated.owner_agent,
                linked_memory_count: (updated.linked_memory_json ?? []).length,
              },
            })
          }
          return {
            title: updated ? "Idea Updated" : "Idea Not Found",
            output: JSON.stringify(updated, null, 2),
            metadata: { action: params.action, id: params.id },
          }
        }),
    } satisfies Tool.DefWithoutID<typeof Parameters, Metadata>
  }),
)
