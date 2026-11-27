import { beforeEach, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  route: { value: { name: 'dashboard' } },
  state: {
    libraryFilter: 'all',
    folderId: 2 as number | undefined,
    tagId: 3 as number | undefined,
  },
  clear: vi.fn(),
  load: vi.fn(),
  select: vi.fn(),
  blocked: { value: false },
}))
vi.mock('@/services/api', () => ({ api: {} }))
vi.mock('@/router', () => ({
  router: {
    currentRoute: mock.route,
    push: async () => {
      mock.route.value.name = 'notes'
    },
  },
  RouterName: { notesSpace: 'notes' },
}))
vi.mock('../useNotesApp', () => ({
  useNotesApp: () => ({ notesState: mock.state }),
}))
vi.mock('../useNoteSearch', () => ({
  useNoteSearch: () => ({ clearSearch: mock.clear }),
}))
vi.mock('../useNoteFolders', () => ({
  useNoteFolders: () => ({
    clearFolderSelection: () => {
      mock.state.folderId = undefined
    },
  }),
}))
vi.mock('../useNotes', () => ({
  getLibraryFilterQuery: (filter?: string) => {
    if (filter === 'favorites')
      return { isFavorites: 1 }
    if (filter === 'trash')
      return { isDeleted: 1 }
    if (filter === 'all')
      return { isDeleted: 0 }
    if (filter === 'inbox')
      return { isInbox: 1 }
    if (filter === 'tasks')
      return { propertyType: 'task' }
    if (filter === 'today') {
      return {
        propertyDue: 'today',
        propertyStatusNot: 'done',
        propertyType: 'task',
      }
    }
    if (filter === 'upcoming') {
      return {
        propertyDue: 'upcoming',
        propertyStatusNot: 'done',
        propertyType: 'task',
      }
    }
    if (
      filter === 'todo'
      || filter === 'inProgress'
      || filter === 'blocked'
    ) {
      return {
        propertyStatus: filter,
        propertyType: 'task',
      }
    }
    if (filter === 'completed') {
      return {
        propertyStatus: 'done',
        propertyType: 'task',
      }
    }
    return {}
  },
  useNotes: () => ({
    getNotes: mock.load,
    selectFirstNote: mock.select,
    isRestoreStateBlocked: mock.blocked,
    withNotesLoading: (fn: () => unknown) => fn(),
  }),
}))
const { useNotesWorkspaceNavigation } = await import(
  '../useNotesWorkspaceNavigation'
)
beforeEach(() => {
  vi.clearAllMocks()
  mock.load.mockResolvedValue(true)
  mock.route.value.name = 'dashboard'
  mock.state.folderId = 2
  mock.state.tagId = 3
})
it.each([
  ['tasks', { propertyType: 'task' }],
  [
    'today',
    { propertyType: 'task', propertyDue: 'today', propertyStatusNot: 'done' },
  ],
  [
    'upcoming',
    {
      propertyType: 'task',
      propertyDue: 'upcoming',
      propertyStatusNot: 'done',
    },
  ],
  ['todo', { propertyType: 'task', propertyStatus: 'todo' }],
  ['inProgress', { propertyType: 'task', propertyStatus: 'inProgress' }],
  ['blocked', { propertyType: 'task', propertyStatus: 'blocked' }],
  ['completed', { propertyType: 'task', propertyStatus: 'done' }],
] as const)(
  'loads the actual %s filter, clears competing filters and selects after success',
  async (filter, query) => {
    expect(await useNotesWorkspaceNavigation().openNotesLibrary(filter)).toBe(
      true,
    )
    expect(mock.load).toHaveBeenCalledWith(query)
    expect(mock.clear).toHaveBeenCalledOnce()
    expect(mock.state).toEqual({
      libraryFilter: filter,
      folderId: undefined,
      tagId: undefined,
    })
    expect(mock.select).toHaveBeenCalledOnce()
  },
)
it('does not select stale list contents after load failure or cancellation', async () => {
  mock.load.mockResolvedValue(false)
  expect(await useNotesWorkspaceNavigation().openNotesLibrary('tasks')).toBe(
    false,
  )
  expect(mock.select).not.toHaveBeenCalled()
  let current = true
  mock.load.mockImplementation(async () => {
    current = false
    return true
  })
  expect(
    await useNotesWorkspaceNavigation().openNotesLibrary(
      'tasks',
      () => current,
    ),
  ).toBe(false)
  expect(mock.select).not.toHaveBeenCalled()
})
