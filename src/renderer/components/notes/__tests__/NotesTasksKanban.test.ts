import {
  createTaskCompletionPatch,
  createTaskStatusPatch,
  getTaskStatus,
  groupTasksByStatus,
  isNoteTaskStatus,
  NoteTaskStatus,
  TASK_KANBAN_STATUSES,
} from '@/composables/spaces/notes/taskProperties'
import { describe, expect, it, vi } from 'vitest'
import {
  computed,
  createRenderer,
  defineComponent,
  ref,
  ssrContextKey,
} from 'vue'

const mocks = vi.hoisted(() => ({
  createTaskAndSelect: vi.fn(),
  deleteSelectedNotes: vi.fn(),
  selectNote: vi.fn(),
  updateNoteProperties: vi.fn(),
  notesState: {
    noteId: 42 as number | undefined,
  },
}))

vi.mock('@/composables', () => ({
  createTaskCompletionPatch,
  createTaskStatusPatch,
  getTaskStatus,
  groupTasksByStatus,
  isNoteTaskStatus,
  NoteTaskStatus,
  TASK_KANBAN_STATUSES,
  useDeleteShortcut: vi.fn(),
  useNotes: () => ({
    createTaskAndSelect: mocks.createTaskAndSelect,
    deleteSelectedNotes: mocks.deleteSelectedNotes,
    isNotesLoading: ref(false),
    isNotesLoadingVisible: ref(false),
    selectNote: mocks.selectNote,
    updateNoteProperties: mocks.updateNoteProperties,
  }),
  useNotesApp: () => ({
    focusedNoteId: ref<number | undefined>(),
    highlightedNoteIds: ref(new Set<number>()),
    isNotesSidebarHidden: ref(false),
    notesState: mocks.notesState,
    toggleNotesSidebar: vi.fn(),
  }),
  useNoteSearch: () => ({
    displayedNotes: ref([]),
  }),
}))

vi.mock('@/electron', () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
}))

describe('notesTasksKanban', () => {
  it.each(TASK_KANBAN_STATUSES)(
    'creates a task with status %s when clicking + in that column',
    async (status) => {
      mocks.createTaskAndSelect.mockClear()
      Object.entries({ computed, ref }).forEach(([key, value]) =>
        vi.stubGlobal(key, value),
      )

      const component = (await import('../NotesTasksKanban.vue')).default
      let setupState: any
      const openedNoteIds: number[] = []
      const renderer = createRenderer({
        patchProp() {},
        insert() {},
        remove() {},
        createElement: () => ({}),
        createText: () => ({}),
        createComment: () => ({}),
        setText() {},
        setElementText() {},
        parentNode: () => null,
        nextSibling: () => null,
      })

      const app = renderer.createApp(
        defineComponent({
          setup() {
            setupState = (component as any).setup(
              { activeNoteId: undefined },
              {
                emit: (event: string, value: number) => {
                  if (event === 'openNote') {
                    openedNoteIds.push(value)
                  }
                },
                expose() {},
              },
            )
            return () => null
          },
        }),
      )
      app.provide(ssrContextKey, {})
      app.mount({})

      try {
        await setupState.createTaskInColumn(status)

        expect(mocks.createTaskAndSelect).toHaveBeenCalledWith({
          properties: {
            status,
            type: 'task',
          },
        })
        expect(openedNoteIds).toEqual([42])
      }
      finally {
        app.unmount()
      }
    },
  )

  it('includes noteIds in dataTransfer on dragstart so kanban tasks can be dropped on folders or Inbox', async () => {
    Object.entries({ computed, ref }).forEach(([key, value]) =>
      vi.stubGlobal(key, value),
    )

    const component = (await import('../NotesTasksKanban.vue')).default
    let setupState: any
    const renderer = createRenderer({
      patchProp() {},
      insert() {},
      remove() {},
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText() {},
      setElementText() {},
      parentNode: () => null,
      nextSibling: () => null,
    })

    const app = renderer.createApp(
      defineComponent({
        setup() {
          setupState = (component as any).setup(
            { activeNoteId: undefined },
            { emit: () => {}, expose() {} },
          )
          return () => null
        },
      }),
    )
    app.provide(ssrContextKey, {})
    app.mount({})

    try {
      const setData = vi.fn()
      const dataTransfer = {
        effectAllowed: 'none',
        setData,
      }
      setupState.onDragStart(17, { dataTransfer } as unknown as DragEvent)

      expect(dataTransfer.effectAllowed).toBe('move')
      expect(setData).toHaveBeenCalledWith('text/plain', '17')
      expect(setData).toHaveBeenCalledWith('noteIds', '[17]')
    }
    finally {
      app.unmount()
    }
  })
})
