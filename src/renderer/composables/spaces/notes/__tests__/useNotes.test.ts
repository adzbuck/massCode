import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, shallowRef, watch } from 'vue'

globalThis.computed = computed
globalThis.reactive = reactive
globalThis.ref = ref
globalThis.shallowRef = shallowRef
globalThis.watch = watch

interface SetupOptions {
  confirmed?: boolean
  folderId?: number
  hideCompletedTasksInFolders?: boolean
  isSearch?: boolean
  isTasksKanbanActive?: boolean
  libraryFilter?: string
  nextNotes?: Array<{
    id: number
    folder?: { id: number } | null
    name?: string
  }>
  noteId?: number
  searchQuery?: string
  tagId?: number
}

async function setup(options: SetupOptions = {}) {
  vi.resetModules()

  const notesState = reactive<{
    folderId?: number
    libraryFilter?: string
    noteId?: number
    tagId?: number
  }>({
    folderId: options.folderId,
    libraryFilter: options.libraryFilter ?? 'today',
    noteId: options.noteId ?? 1,
    tagId: options.tagId,
  })
  const notesCreateKind = ref<'note' | 'task'>('note')
  const isSearch = ref(options.isSearch ?? false)
  const searchQuery = ref(options.searchQuery ?? '')
  const hideCompletedTasksInFolders = ref(
    options.hideCompletedTasksInFolders ?? false,
  )
  const isTasksKanbanActive = ref(options.isTasksKanbanActive ?? false)
  const nextNotes = options.nextNotes ?? [{ id: 2 }]
  const markPersistedStorageMutation = vi.fn()
  const patchNotesByIdProperties = vi.fn(async () => undefined)
  const deleteNotesTrash = vi.fn(async () => undefined)
  const postNotesTasksCleanup = vi.fn(async () => ({ data: { count: 1 } }))
  const getNotes = vi.fn(async () => ({ data: nextNotes }))
  const getNotesById = vi.fn(async (id: string) => ({
    data: { id: Number(id) },
  }))
  const postNotes = vi.fn(async () => ({ data: { id: 7 } }))
  const patchNotesById = vi.fn(async () => undefined)
  const patchNotesByIdContent = vi.fn(async () => undefined)
  const postNotesByIdTagsByTagId = vi.fn(async () => undefined)
  const sonner = vi.fn()
  const invoke = vi.fn(async () => ({
    status: 'done',
    count: 1,
    receiptId: 'private-cleanup',
  }))

  vi.doMock('@/composables/useContentSort', () => ({
    useContentSort: () => ({
      getContentSortQuery: vi.fn(() => ({})),
    }),
  }))

  vi.doMock('@/composables/useDialog', () => ({
    useDialog: () => ({
      confirm: vi.fn(async () => options.confirmed ?? true),
    }),
  }))

  vi.doMock('@/composables/useDonations', () => ({
    useDonations: () => ({
      incrementCopy: vi.fn(),
      incrementCreated: vi.fn(),
    }),
  }))

  vi.doMock('@/composables/useStorageMutation', () => ({
    markPersistedStorageMutation,
  }))

  vi.doMock('@/composables/useSonner', () => ({
    useSonner: () => ({
      sonner,
    }),
  }))

  vi.doMock('@/electron', () => ({
    ipc: { invoke },
    store: { preferences: { get: () => '/vault' } },
    i18n: {
      t: (key: string) => key,
    },
  }))

  vi.doMock('@/utils', () => ({
    getContiguousSelection: vi.fn(() => []),
  }))

  vi.doMock('~/renderer/services/api', () => ({
    api: {
      notes: {
        deleteNotesById: vi.fn(),
        deleteNotesTrash,
        deleteNotesByIdTagsByTagId: vi.fn(),
        getNotes,
        getNotesById,
        patchNotesById,
        patchNotesByIdContent,
        patchNotesByIdProperties,
        postNotes,
        postNotesByIdTagsByTagId,
        postNotesTasksCleanup,
      },
    },
  }))

  vi.doMock('../useNoteContent', () => ({
    useNoteContent: () => ({
      hasBusyNoteContentUpdates: ref(false),
      updateNoteContent: vi.fn(),
    }),
  }))

  vi.doMock('../useNotesApp', () => ({
    useNotesApp: () => ({
      focusNoteNameInput: vi.fn(),
      hideCompletedTasksInFolders,
      isTasksKanbanActive,
      notesCreateKind,
      notesState,
    }),
  }))

  vi.doMock('../useNoteSearch', () => ({
    isSearch,
    notesBySearch: ref(),
    searchQuery,
  }))

  const { selectedNoteIds, selectedNoteRecord, useNotes } = await import(
    '../useNotes'
  )

  return {
    deleteNotesTrash,
    invoke,
    getNotes,
    getNotesById,
    markPersistedStorageMutation,
    notesState,
    patchNotesById,
    patchNotesByIdContent,
    patchNotesByIdProperties,
    postNotes,
    postNotesByIdTagsByTagId,
    postNotesTasksCleanup,
    searchQuery,
    selectedNoteIds,
    selectedNoteRecord,
    sonner,
    useNotes,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useNotes', () => {
  it('keeps a loaded editor readable while a guarded refresh checks and applies its new baseline', async () => {
    const context = await setup({ noteId: 5 })
    const notes = context.useNotes()
    await notes.refreshSelectedNote()
    let finish!: (value: { data: { id: number, content: string } }) => void
    context.getNotesById.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    // NotesEditorPane exposes its snapshot only while the record is ready.
    const readEditor = () =>
      notes.selectedNoteRecordStatus.value === 'ready'
        ? notes.displayedNoteRecord.value
        : undefined
    const current = readEditor()
    const refreshing = notes.refreshSelectedNote(
      () => readEditor() === current,
    )
    expect(readEditor()).toBe(current)
    finish({ data: { id: 5, content: 'restored baseline' } })
    expect(await refreshing).toBe(true)
    expect(notes.displayedNoteRecord.value?.content).toBe('restored baseline')
    expect(notes.selectedNoteRecordStatus.value).toBe('ready')
  })

  it('preserves the displayed note when a guarded refresh becomes stale during its GET', async () => {
    const context = await setup({ noteId: 5 })
    const notes = context.useNotes()
    await notes.refreshSelectedNote()
    let accept = true
    let finish!: (value: { data: { id: number, content: string } }) => void
    context.getNotesById.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const refreshing = notes.refreshSelectedNote(() => accept)
    const current = notes.displayedNoteRecord.value!
    current.content = 'new manual input'
    accept = false
    finish({ data: { id: 5, content: 'outdated persisted text' } })
    expect(await refreshing).toBe(false)
    expect(notes.displayedNoteRecord.value).toBe(current)
    expect(notes.displayedNoteRecord.value?.content).toBe('new manual input')
    expect(notes.selectedNoteRecordStatus.value).toBe('ready')
  })

  it('keeps selected note aligned while loading and after an error', async () => {
    const context = await setup({ noteId: 5 })
    const notes = context.useNotes()
    await notes.refreshSelectedNote()
    await notes.getNotes()
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    let rejectRequest!: (reason: Error) => void
    context.getNotesById.mockImplementationOnce(
      () => new Promise((_resolve, reject) => (rejectRequest = reject)),
    )

    context.notesState.noteId = 2

    expect(notes.selectedNoteRecordStatus.value).toBe('loading')
    expect(notes.selectedNote.value?.id).toBe(2)
    expect(notes.displayedNoteRecord.value?.id).toBe(5)

    rejectRequest(new Error('network'))
    await vi.waitFor(() => {
      expect(notes.selectedNoteRecordStatus.value).toBe('error')
      expect(notes.selectedNote.value?.id).toBe(2)
      expect(notes.displayedNoteRecord.value?.id).toBe(5)
    })

    await notes.retrySelectedNote()
    expect(notes.selectedNote.value?.id).toBe(2)
    expect(notes.displayedNoteRecord.value?.id).toBe(2)

    context.notesState.noteId = undefined
    expect(notes.displayedNoteRecord.value).toBeUndefined()
    consoleError.mockRestore()
  })

  it('exposes loading, error and ready states for the selected full record', async () => {
    const context = await setup({ noteId: 5 })
    const notes = context.useNotes()
    const error = new Error('network')
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    context.getNotesById.mockRejectedValueOnce(error)

    const request = notes.refreshSelectedNote()

    expect(notes.selectedNoteRecordStatus.value).toBe('loading')
    await request
    expect(notes.selectedNoteRecordStatus.value).toBe('error')

    await notes.retrySelectedNote()

    expect(context.getNotesById).toHaveBeenCalledTimes(2)
    expect(notes.selectedNoteRecordStatus.value).toBe('ready')
    consoleError.mockRestore()
  })

  it('selects the first note after property updates remove the current note from the active list', async () => {
    const context = await setup({
      nextNotes: [{ id: 2 }],
      noteId: 1,
    })

    await context.useNotes().updateNoteProperties(1, {
      properties: { status: 'done' },
    })

    expect(context.patchNotesByIdProperties).toHaveBeenCalledWith('1', {
      properties: { status: 'done' },
    })
    expect(context.getNotes).toHaveBeenCalledWith({
      propertyDue: 'today',
      propertyStatusNot: 'done',
      propertyType: 'task',
    })
    expect(context.notesState.noteId).toBe(2)
    expect(context.selectedNoteIds.value).toEqual([2])
  })

  it('clears the selected and displayed note records when property updates leave the active list empty', async () => {
    const context = await setup({
      libraryFilter: 'todo',
      nextNotes: [],
      noteId: 1,
    })
    const notes = context.useNotes()

    await notes.refreshSelectedNote()
    expect(notes.displayedNoteRecord.value?.id).toBe(1)

    await notes.updateNoteProperties(1, {
      properties: { status: 'inProgress' },
    })

    expect(context.notesState.noteId).toBeUndefined()
    expect(context.selectedNoteIds.value).toEqual([])
    expect(context.selectedNoteRecord.value).toBeUndefined()
    expect(notes.displayedNoteRecord.value).toBeUndefined()
    expect(notes.selectedNoteRecordStatus.value).toBe('idle')
  })

  it('keeps the current selection when property updates leave it in the active list', async () => {
    const context = await setup({
      nextNotes: [{ id: 1 }, { id: 2 }],
      noteId: 1,
    })

    await context.useNotes().updateNoteProperties(1, {
      properties: { priority: 'high' },
    })

    expect(context.notesState.noteId).toBe(1)
    expect(context.selectedNoteIds.value).toEqual([1])
  })

  it('creates a task and switches task-only filters to the task list', async () => {
    const context = await setup({
      libraryFilter: 'today',
      nextNotes: [{ id: 7, folder: null, name: 'Created Task' }],
    })

    await context.useNotes().createTaskAndSelect()

    expect(context.postNotes).toHaveBeenCalledWith({
      folderId: null,
      name: 'notes.untitled 1',
      properties: {
        status: 'todo',
        type: 'task',
      },
    })
    expect(context.notesState.libraryFilter).toBe('tasks')
    expect(context.notesState.noteId).toBe(7)
    expect(context.selectedNoteIds.value).toEqual([7])
  })

  it('creates a note and switches task filters to all notes', async () => {
    const context = await setup({
      libraryFilter: 'tasks',
      nextNotes: [{ id: 7, folder: null, name: 'Created Note' }],
    })

    await context.useNotes().createNoteAndSelect()

    expect(context.postNotes).toHaveBeenCalledWith({
      folderId: null,
      name: 'notes.untitled 1',
    })
    expect(context.notesState.libraryFilter).toBe('all')
    expect(context.notesState.noteId).toBe(7)
  })

  it('duplicates note fields, content and tags with a unique sibling name', async () => {
    const context = await setup({
      folderId: 4,
      libraryFilter: 'all',
      nextNotes: [
        { id: 1, folder: { id: 4 }, name: 'Plan' },
        { id: 2, folder: { id: 4 }, name: 'Plan - copy' },
        { id: 3, folder: { id: 4 }, name: 'Plan - copy 2' },
      ],
    })
    const apiModule = await import('~/renderer/services/api')
    vi.mocked(apiModule.api.notes.getNotesById).mockResolvedValueOnce({
      data: {
        content: '# Plan',
        description: 'Release plan',
        folder: { id: 4, name: 'Projects' },
        id: 1,
        name: 'Plan',
        properties: { priority: 'high', type: 'task' },
        tags: [
          { id: 8, name: 'work' },
          { id: 9, name: 'release' },
        ],
      },
    } as never)

    const id = await context.useNotes().duplicateNote(1)

    expect(id).toBe(7)
    expect(context.postNotes).toHaveBeenCalledWith({
      folderId: 4,
      name: 'Plan - copy 3',
      properties: { priority: 'high', type: 'task' },
    })
    expect(context.patchNotesById).toHaveBeenCalledWith('7', {
      description: 'Release plan',
    })
    expect(context.patchNotesByIdContent).toHaveBeenCalledWith('7', {
      content: '# Plan',
    })
    expect(context.postNotesByIdTagsByTagId.mock.calls).toEqual([
      ['7', '8'],
      ['7', '9'],
    ])
    expect(context.markPersistedStorageMutation).toHaveBeenCalledOnce()
    expect(context.getNotes).toHaveBeenCalledTimes(2)
    expect(context.getNotes).toHaveBeenLastCalledWith({ folderId: 4 })
  })

  it.each([
    ['cloud-pending', { pendingCloudDownload: true }, true],
    ['deleted', { isDeleted: 1 }, false],
  ])('does not duplicate a %s note', async (_, sourceState, expectsWarning) => {
    const context = await setup({ libraryFilter: 'all' })
    const apiModule = await import('~/renderer/services/api')
    vi.mocked(apiModule.api.notes.getNotesById).mockResolvedValueOnce({
      data: {
        content: '# Plan',
        description: null,
        folder: null,
        id: 1,
        isDeleted: 0,
        name: 'Plan',
        properties: {},
        tags: [],
        ...sourceState,
      },
    } as never)

    const id = await context.useNotes().duplicateNote(1)

    expect(id).toBeUndefined()
    expect(context.postNotes).not.toHaveBeenCalled()
    expect(context.markPersistedStorageMutation).not.toHaveBeenCalled()
    expect(context.sonner).toHaveBeenCalledTimes(expectsWarning ? 1 : 0)
  })

  it('switches Favorites to All before refreshing a duplicated note', async () => {
    const context = await setup({
      libraryFilter: 'favorites',
      nextNotes: [{ id: 1, folder: null, name: 'Plan' }],
    })
    const apiModule = await import('~/renderer/services/api')
    vi.mocked(apiModule.api.notes.getNotesById).mockResolvedValueOnce({
      data: {
        content: '',
        description: null,
        folder: null,
        id: 1,
        isDeleted: 0,
        name: 'Plan',
        properties: {},
        tags: [],
      },
    } as never)

    await context.useNotes().duplicateNote(1)

    expect(context.notesState.libraryFilter).toBe('all')
    expect(context.getNotes).toHaveBeenLastCalledWith({
      isDeleted: 0,
      propertyTypeNot: 'task',
    })
  })

  it('combines search with the selected tag context', async () => {
    const context = await setup({
      isSearch: true,
      searchQuery: 'migration',
      tagId: 12,
    })

    await context.useNotes().getNotes()

    expect(context.getNotes).toHaveBeenCalledWith({
      search: 'migration',
      tagId: 12,
    })
  })

  it.each([
    ['todo', { propertyStatus: 'todo', propertyType: 'task' }],
    ['inProgress', { propertyStatus: 'inProgress', propertyType: 'task' }],
    ['blocked', { propertyStatus: 'blocked', propertyType: 'task' }],
  ] as const)('queries %s task status library filter', async (libraryFilter, expectedQuery) => {
    const context = await setup({ libraryFilter })

    await context.useNotes().getNotes()

    expect(context.getNotes).toHaveBeenCalledWith(expectedQuery)
  })

  it.each([
    ['todo', 'todo'],
    ['inProgress', 'inProgress'],
    ['blocked', 'blocked'],
    ['completed', 'done'],
  ] as const)(
    'defaults new task status to %s and keeps the %s library filter when creating a task',
    async (libraryFilter, expectedStatus) => {
      const context = await setup({
        libraryFilter,
        nextNotes: [{ id: 7, folder: null, name: 'Created Task' }],
      })

      await context.useNotes().createTaskAndSelect()

      expect(context.postNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            status: expectedStatus,
            type: 'task',
          },
        }),
      )
      expect(context.notesState.libraryFilter).toBe(libraryFilter)
      expect(context.notesState.noteId).toBe(7)
    },
  )

  it.each(['inProgress', 'blocked', 'completed'] as const)(
    'respects explicit status payload from createTaskStatusPatch and switches %s filter to Tasks when mismatched',
    async (libraryFilter) => {
      const { createTaskStatusPatch, NoteTaskStatus } = await import(
        '../taskProperties'
      )
      const context = await setup({
        libraryFilter,
        nextNotes: [{ id: 7, folder: null, name: 'Created Task' }],
      })

      await context
        .useNotes()
        .createTaskAndSelect(createTaskStatusPatch(NoteTaskStatus.Todo))

      expect(context.postNotes).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            status: 'todo',
            type: 'task',
          },
        }),
      )
      expect(context.notesState.libraryFilter).toBe('tasks')
      expect(context.notesState.noteId).toBe(7)
    },
  )

  it('combines search with task library filters', async () => {
    const context = await setup({
      isSearch: true,
      libraryFilter: 'today',
      searchQuery: 'release',
    })

    await context.useNotes().getNotes()

    expect(context.getNotes).toHaveBeenCalledWith({
      propertyDue: 'today',
      propertyStatusNot: 'done',
      propertyType: 'task',
      search: 'release',
    })
  })

  it('hides completed tasks in folders and the Tasks library filter when enabled, while keeping Completed intact', async () => {
    const tasksContext = await setup({
      hideCompletedTasksInFolders: true,
      libraryFilter: 'tasks',
    })
    await tasksContext.useNotes().getNotes()
    expect(tasksContext.getNotes).toHaveBeenCalledWith({
      hideCompletedTasks: 1,
      propertyType: 'task',
    })

    const folderContext = await setup({
      folderId: 3,
      hideCompletedTasksInFolders: true,
    })
    await folderContext.useNotes().getNotes()
    expect(folderContext.getNotes).toHaveBeenCalledWith({
      folderId: 3,
      hideCompletedTasks: 1,
    })

    const completedContext = await setup({
      hideCompletedTasksInFolders: true,
      libraryFilter: 'completed',
    })
    await completedContext.useNotes().getNotes()
    expect(completedContext.getNotes).toHaveBeenCalledWith({
      propertyStatus: 'done',
      propertyType: 'task',
    })

    const kanbanContext = await setup({
      hideCompletedTasksInFolders: true,
      isTasksKanbanActive: true,
      libraryFilter: 'tasks',
    })
    await kanbanContext.useNotes().getNotes()
    expect(kanbanContext.getNotes).toHaveBeenCalledWith({
      propertyType: 'task',
    })
  })

  it('marks cleanup as persisted and selects the first note when cleanup removes the current note from the active list', async () => {
    const context = await setup({
      libraryFilter: 'completed',
      nextNotes: [{ id: 2 }],
      noteId: 1,
    })

    await context.useNotes().cleanupCompletedTasks({ skipConfirm: true })

    expect(context.markPersistedStorageMutation).toHaveBeenCalledOnce()
    expect(context.postNotesTasksCleanup).toHaveBeenCalledOnce()
    expect(context.getNotes).toHaveBeenCalledWith({
      propertyStatus: 'done',
      propertyType: 'task',
    })
    expect(context.notesState.noteId).toBe(2)
    expect(context.selectedNoteIds.value).toEqual([2])
    expect(context.sonner).toHaveBeenCalledWith({
      message: 'notes.tasks.cleanupDone',
      type: 'success',
    })
  })

  it('clears the selected note when emptying trash leaves no notes', async () => {
    const context = await setup({
      libraryFilter: 'trash',
      nextNotes: [],
      noteId: 1,
    })

    await context.useNotes().emptyTrash()

    expect(context.deleteNotesTrash).toHaveBeenCalledWith({
      propertyTypeNot: 'task',
    })
    expect(context.getNotes).toHaveBeenCalledWith({
      isDeleted: 1,
      propertyTypeNot: 'task',
    })
    expect(context.notesState.noteId).toBeUndefined()
    expect(context.selectedNoteIds.value).toEqual([])
  })

  it('parses task status and due tokens from searchQuery', async () => {
    const context = await setup({
      isSearch: true,
      libraryFilter: 'inbox',
      searchQuery: 'status:inProgress due:today release',
    })

    await context.useNotes().getNotes()

    expect(context.getNotes).toHaveBeenCalledWith({
      isInbox: 1,
      propertyDue: 'today',
      propertyStatus: 'inProgress',
      propertyStatusNot: 'done',
      propertyType: 'task',
      search: 'release',
    })
  })

  it('queries tasksInbox, tasksFavorites, and tasksTrash filters strictly for tasks', async () => {
    const inboxCtx = await setup({ libraryFilter: 'tasksInbox' })
    await inboxCtx.useNotes().getNotes()
    expect(inboxCtx.getNotes).toHaveBeenCalledWith({
      isInbox: 1,
      propertyType: 'task',
    })

    const favCtx = await setup({ libraryFilter: 'tasksFavorites' })
    await favCtx.useNotes().getNotes()
    expect(favCtx.getNotes).toHaveBeenCalledWith({
      isFavorites: 1,
      propertyType: 'task',
    })

    const trashCtx = await setup({ libraryFilter: 'tasksTrash' })
    await trashCtx.useNotes().getNotes()
    expect(trashCtx.getNotes).toHaveBeenCalledWith({
      isDeleted: 1,
      propertyType: 'task',
    })
  })

  it('optimistically removes a note from the current folder list before patchNotesById resolves', async () => {
    const context = await setup({
      folderId: 5,
      noteId: 1,
      nextNotes: [{ id: 2 }],
    })
    const { notes, updateNote } = context.useNotes()
    notes.value = [
      { id: 1, folder: { id: 5, name: 'Work' } } as any,
      { id: 2, folder: { id: 5, name: 'Work' } } as any,
    ]

    let resolvePatch!: () => void
    context.patchNotesById.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePatch = resolve
        }),
    )

    const updatePromise = updateNote(1, { folderId: null })

    expect(notes.value?.map((n: any) => n.id)).toEqual([2])
    expect(context.notesState.noteId).toBe(2)

    resolvePatch()
    await updatePromise
  })
})

it('retains the cleanup receipt when the native mutation succeeds but refresh fails', async () => {
  const context = await setup()
  context.getNotes.mockRejectedValueOnce(new Error('refresh failed'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect(
      await context
        .useNotes()
        .cleanupCompletedTasks({ skipConfirm: true, captureUndo: true }),
    ).toEqual({
      status: 'failed',
      count: 1,
      persisted: true,
      receiptId: 'private-cleanup',
    })
    expect(context.invoke).toHaveBeenCalledWith('system:tasks-cleanup', {
      vault: '/vault',
    })
    expect(context.postNotesTasksCleanup).not.toHaveBeenCalled()
  }
  finally {
    log.mockRestore()
  }
})
it('does not start native cleanup when confirmation is cancelled', async () => {
  const context = await setup({ confirmed: false })
  expect(
    await context.useNotes().cleanupCompletedTasks({ captureUndo: true }),
  ).toEqual({ status: 'cancelled' })
  expect(context.invoke).not.toHaveBeenCalled()
  expect(context.postNotesTasksCleanup).not.toHaveBeenCalled()
})
