import { isTaskNote, NoteTaskStatus } from '@/composables/spaces/notes/taskProperties'
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
  updateNote: vi.fn(),
  updateNotes: vi.fn(),
  updateNoteProperties: vi.fn(),
  deleteSelectedNotes: vi.fn(),
  duplicateNote: vi.fn(),
  selectNote: vi.fn(),
  selectedNote: { value: undefined },
  notesState: {
    folderId: 5 as number | undefined,
    libraryFilter: undefined as string | undefined,
    noteId: 11 as number | undefined,
  },
}))

vi.mock('@/composables', () => ({
  isTaskNote,
  NoteTaskStatus,
  useDialog: () => ({ confirm: vi.fn() }),
  useDonations: () => ({ incrementCopy: vi.fn() }),
  useNoteFolders: () => ({ getNoteFolders: vi.fn() }),
  useNotes: () => ({
    selectFirstNote: mocks.selectFirstNote,
    selectedNoteIds: mocks.selectedNoteIds,
    updateNote: mocks.updateNote,
    updateNotes: mocks.updateNotes,
    updateNoteProperties: mocks.updateNoteProperties,
    deleteSelectedNotes: mocks.deleteSelectedNotes,
    duplicateNote: mocks.duplicateNote,
    selectNote: mocks.selectNote,
    selectedNote: mocks.selectedNote,
  }),
  useNotesApp: () => ({
    focusNoteNameInput: vi.fn(),
    notesState: mocks.notesState,
  }),
  useSonner: () => ({ sonner: vi.fn() }),
}))

vi.mock('@/electron', () => ({
  i18n: { t: (key: string) => key },
  ipc: { invoke: vi.fn() },
  store: {
    preferences: { get: vi.fn() },
  },
}))

vi.mock('@vueuse/core', () => ({
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
})
