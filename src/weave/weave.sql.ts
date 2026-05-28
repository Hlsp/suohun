import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { ProjectID } from "@/project/schema"
import type { SessionID } from "@/session/schema"
import { ProjectTable } from "@/project/project.sql"
import { SessionTable } from "@/session/session.sql"
import { Timestamps } from "@/storage/schema.sql"

export const WeaveRunTable = sqliteTable(
  "weave_run",
  {
    id: text().primaryKey(),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    objective: text(),
    profile: text(),
    phase: text(),
    status: text().notNull(),
    manager_agent: text(),
    observer_agent: text(),
    limits_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    stop_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [index("weave_run_session_id_idx").on(table.session_id), index("weave_run_project_id_idx").on(table.project_id)],
)

export const WeaveMemoryTable = sqliteTable(
  "weave_memory",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    scope: text().notNull(),
    session_id: text().$type<SessionID>(),
    target: text(),
    kind: text().notNull(),
    content: text().notNull(),
    evidence_json: text({ mode: "json" }).$type<string[]>(),
    source_agent: text(),
    source_message_id: text(),
    source_part_id: text(),
    confidence: integer().notNull().default(50),
    trust: text().notNull().default("candidate"),
    tags_json: text({ mode: "json" }).$type<string[]>(),
    ...Timestamps,
  },
  (table) => [
    index("weave_memory_project_id_idx").on(table.project_id),
    index("weave_memory_session_id_idx").on(table.session_id),
    index("weave_memory_scope_idx").on(table.scope),
    index("weave_memory_trust_idx").on(table.trust),
  ],
)

export const WeaveIdeaTable = sqliteTable(
  "weave_idea",
  {
    id: text().primaryKey(),
    run_id: text().references(() => WeaveRunTable.id, { onDelete: "set null" }),
    project_id: text()
      .$type<ProjectID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    session_id: text().$type<SessionID>(),
    title: text().notNull(),
    hypothesis: text().notNull(),
    rationale: text(),
    status: text().notNull().default("open"),
    priority: integer().notNull().default(50),
    owner_agent: text(),
    linked_memory_json: text({ mode: "json" }).$type<string[]>(),
    last_progress_at: integer(),
    ...Timestamps,
  },
  (table) => [
    index("weave_idea_project_id_idx").on(table.project_id),
    index("weave_idea_session_id_idx").on(table.session_id),
    index("weave_idea_status_idx").on(table.status),
    index("weave_idea_priority_idx").on(table.priority),
  ],
)

export const WeaveEventTable = sqliteTable(
  "weave_event",
  {
    id: text().primaryKey(),
    run_id: text().references(() => WeaveRunTable.id, { onDelete: "set null" }),
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    agent: text(),
    role: text().notNull(),
    type: text().notNull(),
    payload_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ...Timestamps,
  },
  (table) => [index("weave_event_run_id_idx").on(table.run_id), index("weave_event_session_id_idx").on(table.session_id)],
)
