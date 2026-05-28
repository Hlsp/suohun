export * as ConfigWeave from "./weave"

import { PositiveInt } from "@opencode-ai/core/schema"
import { Schema } from "effect"

const Scope = Schema.Literal("global", "project", "target", "session")
const Profile = Schema.Literal("src", "ctf", "code-audit", "lab")
const Trust = Schema.Literal("candidate", "verified", "rejected", "stale")

export const Info = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  default_profile: Schema.optional(Profile),
  manager_agent: Schema.optional(Schema.String),
  observer_agent: Schema.optional(Schema.String),
  dispatch: Schema.optional(
    Schema.Struct({
      max_parallel_solvers: Schema.optional(PositiveInt),
      background: Schema.optional(Schema.Boolean),
      solver_timeout_ms: Schema.optional(PositiveInt),
    }),
  ),
  observer: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean),
      interval_turns: Schema.optional(PositiveInt),
      on_solver_complete: Schema.optional(Schema.Boolean),
      min_intervention_severity: Schema.optional(Schema.Literal("info", "warn", "critical")),
      max_advisories_per_turn: Schema.optional(PositiveInt),
    }),
  ),
  memory: Schema.optional(
    Schema.Struct({
      enabled: Schema.optional(Schema.Boolean),
      scopes: Schema.optional(Schema.Array(Scope)),
      max_injected_facts: Schema.optional(PositiveInt),
      max_injected_ideas: Schema.optional(PositiveInt),
      require_evidence: Schema.optional(Schema.Boolean),
      auto_promote: Schema.optional(Schema.Literal("never", "manager", "observer")),
      default_trust: Schema.optional(Trust),
    }),
  ),
  stop: Schema.optional(
    Schema.Struct({
      max_turns: Schema.optional(PositiveInt),
      max_no_progress_turns: Schema.optional(PositiveInt),
      require_manager_finish: Schema.optional(Schema.Boolean),
    }),
  ),
}).annotate({ identifier: "ConfigWeave" })

export type Info = Schema.Schema.Type<typeof Info>
