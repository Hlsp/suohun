import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { InternalTuiPlugin } from "../../plugin/internal"
import { createMemo, createSignal, For, Show } from "solid-js"

const id = "internal:sidebar-weave"

type WeaveMemoryRow = {
  id: string
  content: string
  trust: string
  kind: string
}

type WeaveIdeaRow = {
  id: string
  title: string
  status: string
  priority: number
}

type WeaveEventRow = {
  id: string
  role: string
  type: string
  time_created?: number
}

type RuntimeEventRow = {
  id: string
  role: string
  type: string
  time_created: number
}

function parseRows<T>(value: unknown): T[] {
  if (typeof value !== "string") return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function dedupeByID<T extends { id: string }>(rows: T[]) {
  const map = new Map<string, T>()
  for (const row of rows) {
    if (!row.id) continue
    map.set(row.id, row)
  }
  return [...map.values()]
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const [open, setOpen] = createSignal(true)
  const theme = () => props.api.theme.current
  const messages = createMemo(() => props.api.state.session.messages(props.session_id))
  const sessionStatus = createMemo(() => props.api.state.session.status(props.session_id))

  const state = createMemo(() => {
    let memoryRows: WeaveMemoryRow[] = []
    let ideaRows: WeaveIdeaRow[] = []
    let eventRows: WeaveEventRow[] = []
    let runtimeRows: RuntimeEventRow[] = []

    for (const message of messages()) {
      for (const part of props.api.state.part(message.id)) {
        if (part.type !== "tool") continue
        if (part.state.status !== "completed") continue

        if (part.tool === "weave_memory") {
          const action = typeof part.state.input?.action === "string" ? part.state.input.action : undefined
          if (action !== "list") continue
          memoryRows = parseRows<WeaveMemoryRow>(part.state.output)
          continue
        }

        if (part.tool === "weave_idea") {
          const action = typeof part.state.input?.action === "string" ? part.state.input.action : undefined
          if (action !== "list") continue
          ideaRows = parseRows<WeaveIdeaRow>(part.state.output)
          continue
        }

        if (part.tool === "weave_event") {
          const action = typeof part.state.input?.action === "string" ? part.state.input.action : undefined
          if (action !== "list") continue
          eventRows = parseRows<WeaveEventRow>(part.state.output)
          continue
        }

        if (part.tool === "task") {
          const subagent = typeof part.state.input?.subagent_type === "string" ? part.state.input.subagent_type : "unknown"
          const taskID = typeof part.state.metadata?.sessionId === "string" ? part.state.metadata.sessionId : undefined
          const timeCreated = typeof part.time.created === "number" ? part.time.created : 0
          runtimeRows = [
            ...runtimeRows,
            {
              id: `${part.id}:dispatch`,
              role: "manager",
              type: `dispatch.${subagent}`,
              time_created: timeCreated,
            },
            {
              id: `${part.id}:collect`,
              role: "manager",
              type: taskID ? `collect.${taskID.slice(0, 8)}` : `collect.${subagent}`,
              time_created: timeCreated,
            },
          ]
        }
      }
    }

    const memoryList = dedupeByID(memoryRows)
    const ideaList = dedupeByID(ideaRows)

    const recentMemory = memoryList
      .map((row) => ({ id: row.id, trust: row.trust, kind: row.kind, content: row.content }))
      .filter((row) => row.id && row.content)
      .map((row) => ({ ...row, content: row.content.trim().replaceAll("\n", " ") }))
      .filter((row) => row.content.length > 0)
      .slice(0, 3)

    const recentIdeas = ideaList
      .map((row) => ({ id: row.id, title: row.title, status: row.status, priority: row.priority }))
      .filter((row) => row.id && row.title)
      .toSorted((a, b) => b.priority - a.priority)
      .slice(0, 3)

    const recentEvents = [
      ...dedupeByID(eventRows).map((row) => ({
        id: row.id,
        role: row.role,
        type: row.type,
        source: "db",
        time_created: typeof row.time_created === "number" ? row.time_created : 0,
      })),
      ...dedupeByID(runtimeRows).map((row) => ({
        id: row.id,
        role: row.role,
        type: row.type,
        source: "runtime",
        time_created: row.time_created,
      })),
    ]
      .toSorted((a, b) => b.time_created - a.time_created)
      .filter((row) => row.id && row.type)
      .slice(0, 3)

    return {
      memories: memoryList.length,
      ideas: ideaList.length,
      events: dedupeByID(eventRows).length + dedupeByID(runtimeRows).length,
      verifiedMemory: memoryList.filter((row) => row.trust === "verified").length,
      candidateMemory: memoryList.filter((row) => row.trust === "candidate").length,
      openIdeas: ideaList.filter((row) => row.status === "open" || row.status === "active").length,
      blockedIdeas: ideaList.filter((row) => row.status === "blocked").length,
      recentMemory,
      recentIdeas,
      recentEvents,
    }
  })

  const running = createMemo(() => sessionStatus()?.type === "running")

  const show = createMemo(() => state().memories > 0 || state().ideas > 0)

  return (
    <Show when={show()}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => setOpen((x) => !x)}>
          <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
          <text fg={running() ? theme().success : theme().textMuted}>•</text>
          <text fg={theme().text}>
            <b>Weave</b>
            <Show when={!open()}>
              <span style={{ fg: theme().textMuted }}>
                {" "}({state().verifiedMemory} verified, {state().openIdeas} active)
              </span>
            </Show>
          </text>
        </box>

        <Show when={open()}>
          <text fg={theme().textMuted}>
            {state().memories} memories ({state().verifiedMemory} verified, {state().candidateMemory} candidate)
          </text>
          <text fg={theme().textMuted}>
            {state().ideas} ideas ({state().openIdeas} open, {state().blockedIdeas} blocked)
          </text>
          <text fg={theme().textMuted}>{state().events} events</text>

          <Show when={state().recentMemory.length > 0}>
            <text fg={theme().text}>
              <b>Recent Memory</b>
            </text>
            <For each={state().recentMemory}>
              {(item) => (
                <text fg={theme().textMuted} wrapMode="word">
                  - [{item.trust}/{item.kind}] {item.content.slice(0, 90)}
                </text>
              )}
            </For>
          </Show>

          <Show when={state().recentIdeas.length > 0}>
            <text fg={theme().text}>
              <b>Recent Ideas</b>
            </text>
            <For each={state().recentIdeas}>
              {(item) => (
                <text fg={theme().textMuted} wrapMode="word">
                  - ({item.status}/p{item.priority}) {item.title}
                </text>
              )}
            </For>
          </Show>

          <Show when={state().recentEvents.length > 0}>
            <text fg={theme().text}>
              <b>Recent Events</b>
            </text>
            <For each={state().recentEvents}>
              {(item) => (
                <text fg={theme().textMuted} wrapMode="word">
                  - [{item.source}] ({item.role}) {item.type}
                </text>
              )}
            </For>
          </Show>
        </Show>
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 450,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
