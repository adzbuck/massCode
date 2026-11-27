export const NoteTaskStatus = {
  Blocked: 'blocked',
  Done: 'done',
  InProgress: 'inProgress',
  Todo: 'todo',
} as const

export const TASK_KANBAN_STATUSES = [
  NoteTaskStatus.Todo,
  NoteTaskStatus.InProgress,
  NoteTaskStatus.Blocked,
  NoteTaskStatus.Done,
] as const

export const NoteTaskPriority = {
  High: 'high',
  Low: 'low',
  Medium: 'medium',
} as const

export type NoteTaskStatusValue =
  (typeof NoteTaskStatus)[keyof typeof NoteTaskStatus]

export type NoteTaskPriorityValue =
  (typeof NoteTaskPriority)[keyof typeof NoteTaskPriority]

export type NoteProperties = Record<string, unknown>

export interface NoteTaskPropertyPatch {
  properties?: NoteProperties
  unset?: string[]
}

export interface NoteWithProperties {
  properties: NoteProperties
}

export function getNotePropertyString(
  properties: NoteProperties | undefined,
  key: string,
): string | undefined {
  const value = properties?.[key]
  return typeof value === 'string' ? value : undefined
}

export function isTaskNote(note: NoteWithProperties | undefined | null) {
  return getNotePropertyString(note?.properties, 'type') === 'task'
}

export function isTaskToday(
  note: NoteWithProperties | undefined | null,
): boolean {
  const value = note?.properties?.today
  return (
    value === true
    || value === 'true'
    || value === 1
    || value === '1'
  )
}

export function getTaskTodayOrder(
  note: NoteWithProperties | undefined | null,
): number {
  const raw = note?.properties?.todayOrder
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function getTaskStatus(
  note: NoteWithProperties | undefined | null,
): NoteTaskStatusValue {
  const status = getNotePropertyString(note?.properties, 'status')

  if (
    status === NoteTaskStatus.InProgress
    || status === NoteTaskStatus.Done
    || status === NoteTaskStatus.Blocked
  ) {
    return status
  }

  return NoteTaskStatus.Todo
}

export function getTaskPriority(
  note: NoteWithProperties | undefined | null,
): NoteTaskPriorityValue | undefined {
  const priority = getNotePropertyString(note?.properties, 'priority')

  if (
    priority === NoteTaskPriority.Low
    || priority === NoteTaskPriority.Medium
    || priority === NoteTaskPriority.High
  ) {
    return priority
  }

  return undefined
}

export function getTaskDue(
  note: NoteWithProperties | undefined | null,
): string {
  return getNotePropertyString(note?.properties, 'due') || ''
}

export function isNoteTaskStatus(
  value: unknown,
): value is NoteTaskStatusValue {
  return (
    value === NoteTaskStatus.Todo
    || value === NoteTaskStatus.InProgress
    || value === NoteTaskStatus.Blocked
    || value === NoteTaskStatus.Done
  )
}

export function createTaskStatusPatch(
  status: NoteTaskStatusValue,
): NoteTaskPropertyPatch {
  return {
    properties: {
      status,
      type: 'task',
    },
  }
}

export function createTaskCompletionPatch(
  note: NoteWithProperties,
): NoteTaskPropertyPatch {
  const nextStatus
    = getTaskStatus(note) === NoteTaskStatus.Done
      ? NoteTaskStatus.Todo
      : NoteTaskStatus.Done

  return createTaskStatusPatch(nextStatus)
}

export function groupTasksByStatus<T extends NoteWithProperties>(
  notes: readonly T[] | undefined | null,
): Record<NoteTaskStatusValue, T[]> {
  const grouped: Record<NoteTaskStatusValue, T[]> = {
    [NoteTaskStatus.Todo]: [],
    [NoteTaskStatus.InProgress]: [],
    [NoteTaskStatus.Blocked]: [],
    [NoteTaskStatus.Done]: [],
  }

  for (const note of notes ?? []) {
    if (!isTaskNote(note)) {
      continue
    }

    grouped[getTaskStatus(note)].push(note)
  }

  return grouped
}
