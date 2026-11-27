import {
  isTaskNote,
  isTaskToday,
  NoteTaskStatus,
} from '@/composables/spaces/notes/taskProperties'
import { LibraryFilter } from '@/composables/types'
import { describe, expect, it, vi } from 'vitest'
import {
  computed,
  createRenderer,
  defineComponent,
  ref,
  ssrContextKey,
} from 'vue'

const mocks = vi.hoisted(() => ({
  selectFirstNote: vi.fn(),
  selectedNoteIds: { value: [] as number[] },
  setTasksToday: vi.fn(),
  updateNote: vi.fn(),
  updateNotes: vi.fn(),
  updateNoteProperties: vi.fn(),
  deleteSelectedNotes: vi.fn(),
  duplicateNote: vi.fn(),
  selectNote: vi.fn(),
  selectedNote: { value: undefined },
  displayedNotes: {
    value: [] as Array<{ id: number, properties: Record<string, unknown> }>,
  },
  notesState: {
    folderId: 5 as number | undefined,
    libraryFilter: undefined as string | undefined,
    noteId: 11 as number | undefined,
  },
}))

vi.mock('@/composables', () => ({
  isTaskNote,
  isTaskToday,
  NoteTaskStatus,
  useDialog: () => ({ confirm: vi.fn() }),
  useDonations: () => ({ incrementCopy: vi.fn() }),
  useNoteFolders: () => ({ getNoteFolders: vi.fn() }),
  useNotes: () => ({
    cleanupCompletedTasks: vi.fn(),
    emptyTrash: vi.fn(),
    selectFirstNote: mocks.selectFirstNote,
    selectedNoteIds: mocks.selectedNoteIds,
    setTasksToday: mocks.setTasksToday,
    updateNote: mocks.updateNote,
    updateNotes: mocks.updateNotes,
    updateNoteProperties: mocks.updateNoteProperties,
    deleteSelectedNotes: mocks.deleteSelectedNotes,
    duplicateNote: mocks.duplicateNote,
    selectNote: vi.fn(),
    selectedNote: mocks.selectedNote,
  }),
  useNotesApp: () => ({
    focusNoteNameInput: vi.fn(),
    notesCreateKind: { value: 'note' },
    notesState: mocks.notesState,
  }),
  useNoteSearch: () => ({
    displayedNotes: mocks.displayedNotes,
  }),
  useSonner: () => ({ sonner: vi.fn() }),
}))

vi.mock('@/composables/spaces/notes/useNotesWorkspaceNavigation', () => ({
  useNotesWorkspaceNavigation: () => ({
    openNotesLibrary: vi.fn(),
  }),
}))

vi.mock('@/router', () => ({
  RouterName: {
    notesSpace: 'notes-space',
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ name: 'notes-space' }),
}))

vi.mock('@/electron', () => ({
  i18n: { t: (key: string) => key },
  ipc: { invoke: vi.fn() },
  store: {
    preferences: { get: vi.fn() },
  },
}))

vi.mock('@vueuse/core', () => ({
  onClickOutside: vi.fn(),
  useClipboard: () => ({ copy: vi.fn() }),
}))

vi.mock('~/renderer/services/api', () => ({
  api: {
    notes: {
      getNotesById: vi.fn(),
    },
  },
}))

describe('notesListItemContextMenu', () => {
  it('removes a single note or task from its folder and selects the next note when viewing a folder', async () => {
    mocks.updateNote.mockClear()
    mocks.selectFirstNote.mockClear()
    mocks.selectedNoteIds.value = []
    mocks.notesState.folderId = 5
    mocks.notesState.noteId = 11
    mocks.notesState.libraryFilter = LibraryFilter.All

    Object.entries({ computed, ref }).forEach(([key, value]) =>
      vi.stubGlobal(key, value),
    )

    const component = (await import('../NotesListItemContextMenu.vue')).default
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

    const note = {
      id: 11,
      name: 'Task in folder',
      description: null,
      properties: { type: 'task', status: 'todo' },
      tags: [],
      folder: { id: 5, name: 'Work' },
      isFavorites: 0,
      isDeleted: 0,
      createdAt: 1,
      updatedAt: 1,
    }

    const app = renderer.createApp(
      defineComponent({
        setup() {
          setupState = (component as any).setup(
            { note },
            { emit: () => {}, expose() {} },
          )
          return () => null
        },
      }),
    )
    app.provide(ssrContextKey, {})
    app.mount({})

    try {
      expect(setupState.hasFolder.value).toBe(true)
      await setupState.onRemoveFromFolder()

      expect(mocks.updateNote).toHaveBeenCalledWith(11, { folderId: null })
      expect(mocks.selectFirstNote).toHaveBeenCalledTimes(1)
    }
    finally {
      app.unmount()
    }
  })

  it('filters out tasks when dropping onto Notes sidebar items and filters out notes when dropping onto Tasks sidebar items', async () => {
    mocks.updateNotes.mockClear()
    mocks.selectFirstNote.mockClear()
    mocks.displayedNotes.value = [
      { id: 1, properties: {} },
      { id: 2, properties: { type: 'task', status: 'todo' } },
      { id: 3, properties: {} },
    ]

    Object.entries({ computed, ref }).forEach(([key, value]) =>
      vi.stubGlobal(key, value),
    )

    const libraryComponent = (await import('../NotesSidebarLibrary.vue')).default
    const tasksComponent = (await import('../NotesSidebarTasks.vue')).default
    let libraryState: any
    let tasksState: any

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
          libraryState = (libraryComponent as any).setup(
            {},
            { emit: () => {}, expose() {} },
          )
          tasksState = (tasksComponent as any).setup(
            {},
            { emit: () => {}, expose() {} },
          )
          return () => null
        },
      }),
    )
    app.provide(ssrContextKey, {})
    app.mount({})

    try {
      const makeDropEvent = (ids: number[], types: string[]) => ({
        preventDefault: vi.fn(),
        dataTransfer: {
          dropEffect: 'none',
          types,
          getData: (type: string) =>
            type === 'noteIds' ? JSON.stringify(ids) : '',
        },
      })

      // Dragging only a task over Notes Inbox should be rejected
      const taskOnlyOverLibrary = makeDropEvent([2], [
        'application/x-masscode-task',
      ])
      libraryState.onDragOver(
        { id: LibraryFilter.Inbox },
        taskOnlyOverLibrary as unknown as DragEvent,
      )
      expect(libraryState.dragOverItemId.value).toBeUndefined()

      // Dropping multi-selection [1, 2, 3] onto Notes Inbox updates only notes [1, 3]
      await libraryState.onDrop(
        { id: LibraryFilter.Inbox },
        makeDropEvent(
          [1, 2, 3],
          ['application/x-masscode-note', 'application/x-masscode-task'],
        ) as unknown as DragEvent,
      )
      expect(mocks.updateNotes).toHaveBeenCalledWith(
        [1, 3],
        [
          { folderId: null, isDeleted: 0 },
          { folderId: null, isDeleted: 0 },
        ],
      )

      mocks.updateNotes.mockClear()

      // Dragging only a note over Tasks Inbox should be rejected
      const noteOnlyOverTasks = makeDropEvent([1], [
        'application/x-masscode-note',
      ])
      tasksState.onDragOver(
        { id: LibraryFilter.TasksInbox },
        noteOnlyOverTasks as unknown as DragEvent,
      )
      expect(tasksState.dragOverItemId.value).toBeUndefined()

      // Dropping multi-selection [1, 2, 3] onto Tasks Inbox updates only task [2]
      await tasksState.onDrop(
        { id: LibraryFilter.TasksInbox },
        makeDropEvent(
          [1, 2, 3],
          ['application/x-masscode-note', 'application/x-masscode-task'],
        ) as unknown as DragEvent,
      )
      expect(mocks.updateNotes).toHaveBeenCalledWith(
        [2],
        [{ folderId: null, isDeleted: 0 }],
      )
    }
    finally {
      app.unmount()
    }
  })
})
