import { describe, expect, it } from 'vitest'
import {
  createTaskCompletionPatch,
  createTaskStatusPatch,
  groupTasksByStatus,
  isNoteTaskStatus,
  NoteTaskStatus,
  TASK_KANBAN_STATUSES,
} from '../taskProperties'

describe('taskProperties kanban helpers', () => {
  it('defines the 4 ordered kanban statuses', () => {
    expect(TASK_KANBAN_STATUSES).toEqual([
      NoteTaskStatus.Todo,
      NoteTaskStatus.InProgress,
      NoteTaskStatus.Blocked,
      NoteTaskStatus.Done,
    ])
    for (const status of TASK_KANBAN_STATUSES) {
      expect(isNoteTaskStatus(status)).toBe(true)
    }
    expect(isNoteTaskStatus('unknown')).toBe(false)
  })

  it('creates task status and completion patches', () => {
    expect(createTaskStatusPatch(NoteTaskStatus.InProgress)).toEqual({
      properties: {
        status: NoteTaskStatus.InProgress,
        type: 'task',
      },
    })
    expect(
      createTaskCompletionPatch({
        properties: { type: 'task', status: NoteTaskStatus.InProgress },
      }),
    ).toEqual({
      properties: {
        status: NoteTaskStatus.Done,
        type: 'task',
      },
    })
  })

  it('groups task notes into the 4 status buckets and skips non-task notes', () => {
    const grouped = groupTasksByStatus([
      { id: 1, properties: { type: 'task', status: 'todo' } },
      { id: 2, properties: { type: 'task', status: 'inProgress' } },
      { id: 3, properties: { type: 'task', status: 'blocked' } },
      { id: 4, properties: { type: 'task', status: 'done' } },
      { id: 5, properties: { type: 'task' } },
      { id: 6, properties: {} },
    ])

    expect(grouped.todo.map(item => item.id)).toEqual([1, 5])
    expect(grouped.inProgress.map(item => item.id)).toEqual([2])
    expect(grouped.blocked.map(item => item.id)).toEqual([3])
    expect(grouped.done.map(item => item.id)).toEqual([4])
  })
})
