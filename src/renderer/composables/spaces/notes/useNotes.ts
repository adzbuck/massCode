import type { TaskCleanupResult } from '~/main/types/ipc'
import { useContentSort } from '@/composables/useContentSort'
import { useDialog } from '@/composables/useDialog'
import { useDonations } from '@/composables/useDonations'
import { useSonner } from '@/composables/useSonner'
import { markPersistedStorageMutation } from '@/composables/useStorageMutation'
import { i18n, ipc, store } from '@/electron'
import { getContiguousSelection } from '@/utils'
import { benchmarkStart } from '@/utils/benchmark'
import { api } from '~/renderer/services/api'
import { LibraryFilter } from '../../types'
import { NoteTaskStatus, type NoteTaskStatusValue } from './taskProperties'
import { useNoteContent } from './useNoteContent'
import { useNotesApp } from './useNotesApp'
import { isSearch, notesBySearch, searchQuery } from './useNoteSearch'

const {
  notesState,
  focusNoteNameInput,
  notesCreateKind,
  hideCompletedTasksInFolders,
  isTasksKanbanActive,
} = useNotesApp()
const { getContentSortQuery } = useContentSort()

// --- Types ---
// These mirror the generated API types that will exist after api:generate.

interface NoteTagInfo {
  id: number
  name: string
}

interface NoteFolderInfo {
  id: number
  name: string
}

interface NoteRecord {
  id: number
  name: string
  description: string | null
  properties: Record<string, unknown>
  tags: NoteTagInfo[]
  folder: NoteFolderInfo | null
  isFavorites: number
  isDeleted: number
  pendingCloudDownload?: boolean
  createdAt: number
  updatedAt: number
}

// Полная запись заметки (GET /notes/:id): список контент не содержит.
export interface NoteFullRecord extends NoteRecord {
  content: string
}

// Выбранная заметка: пока полная запись загружается, метаданные берутся из
// списка и content временно отсутствует.
export type SelectedNoteView = NoteRecord & { content?: string }

export type SelectedNoteRecordStatus = 'idle' | 'loading' | 'ready' | 'error'

type NotesResponse = NoteRecord[]

interface NotesQuery {
  search?: string
  sort?: string
  order?: 'ASC' | 'DESC'
  folderId?: number
  tagId?: number
  isFavorites?: number
  isDeleted?: number
  isInbox?: number
  propertyDue?: 'today' | 'upcoming'
  propertyStatus?: string
  propertyStatusNot?: string
  propertyType?: string
  propertyTypeNot?: string
  hideCompletedTasks?: number
}

interface NotesUpdate {
  name?: string
  folderId?: number | null
  description?: string | null
  isDeleted?: number
  isFavorites?: number
}

interface NotePropertiesUpdate {
  properties?: Record<string, unknown>
  unset?: string[]
}

interface CreateNotePayload {
  name?: string
  properties?: Record<string, unknown>
}

// --- Module-level state ---

export const selectedNoteIds = ref<number[]>(
  notesState.noteId ? [notesState.noteId] : [],
)
const lastSelectedNoteId = ref<number | undefined>()

export const notes = shallowRef<NotesResponse>()

// Список отдаёт только метаданные, поэтому полная запись выбранной заметки
// (с контентом) загружается отдельно по id.
export const selectedNoteRecord = shallowRef<NoteFullRecord | undefined>()
export const displayedNoteRecord = shallowRef<NoteFullRecord | undefined>()
export const selectedNoteRecordStatus = ref<SelectedNoteRecordStatus>('idle')
let selectedNoteRequestToken = 0
let notesRequestToken = 0

export const isRestoreStateBlocked = ref(false)
const notesLoadingCounter = ref(0)
const isNotesLoadingVisible = ref(false)
const NOTES_LOADING_VISIBILITY_DELAY_MS = 300
let notesLoadingVisibilityTimer: ReturnType<typeof setTimeout> | undefined

// --- Computed ---

const selectedNote = computed<SelectedNoteView | undefined>(() => {
  if (selectedNoteRecord.value?.id === notesState.noteId) {
    return selectedNoteRecord.value
  }

  // Пока полная запись загружается, метаданные берутся из списка,
  // чтобы заголовок и layout не мигали.
  const source = isSearch.value ? notesBySearch.value : notes.value
  return source?.find(n => n.id === notesState.noteId)
})

const selectedNotes = computed(() => {
  const source = isSearch.value ? notesBySearch.value : notes.value
  if (!source?.length || !selectedNoteIds.value.length) {
    return []
  }

  const targetIds = new Set(selectedNoteIds.value)
  return source.filter(n => targetIds.has(n.id))
})

export async function refreshSelectedNote(canApply?: () => boolean) {
  const noteId = notesState.noteId
  const requestToken = ++selectedNoteRequestToken

  if (noteId === undefined) {
    selectedNoteRecord.value = undefined
    displayedNoteRecord.value = undefined
    selectedNoteRecordStatus.value = 'idle'
    return
  }

  // A guarded refresh compares the already mounted editor after the GET.
  // Keep that editor readable while checking whether its content is still current.
  if (
    !canApply
    || selectedNoteRecord.value?.id !== noteId
    || selectedNoteRecordStatus.value !== 'ready'
  ) {
    selectedNoteRecordStatus.value = 'loading'
  }

  const finishBenchmark = benchmarkStart('notes', 'open')
  try {
    const { data } = await api.notes.getNotesById(String(noteId))

    if (
      requestToken === selectedNoteRequestToken
      && notesState.noteId === noteId
      && data.id === noteId
    ) {
      if (canApply && !canApply()) {
        selectedNoteRecordStatus.value = 'ready'
        finishBenchmark('superseded')
        return false
      }
      const record = data as NoteFullRecord
      selectedNoteRecord.value = record
      displayedNoteRecord.value = record
      selectedNoteRecordStatus.value = 'ready'
      finishBenchmark()
      return true
    }
    else {
      finishBenchmark('superseded')
    }
  }
  catch (error) {
    finishBenchmark('error')
    if (requestToken === selectedNoteRequestToken) {
      selectedNoteRecordStatus.value = 'error'
    }
    console.error(error)
  }
}

export function retrySelectedNote() {
  return refreshSelectedNote()
}

watch(
  () => notesState.noteId,
  () => {
    void refreshSelectedNote()
  },
  { flush: 'sync' },
)

function getActionTargetIds(fallbackNoteId?: number) {
  if (fallbackNoteId !== undefined && selectedNoteIds.value.length > 1) {
    return [...selectedNoteIds.value]
  }

  if (fallbackNoteId !== undefined) {
    return [fallbackNoteId]
  }

  if (selectedNoteIds.value.length) {
    return [...selectedNoteIds.value]
  }

  return notesState.noteId !== undefined ? [notesState.noteId] : []
}

function getActionTargetNotes(targetIds: number[], fallbackNote?: NoteRecord) {
  const source = isSearch.value ? notesBySearch.value : notes.value
  const targetIdSet = new Set(targetIds)
  const targetNotes = source?.filter(note => targetIdSet.has(note.id)) || []

  if (
    fallbackNote
    && targetIds.includes(fallbackNote.id)
    && !targetNotes.some(note => note.id === fallbackNote.id)
  ) {
    targetNotes.push(fallbackNote)
  }

  return targetNotes
}

const LIBRARY_FILTER_REQUIRED_TASK_STATUS: Partial<
  Record<
    (typeof LibraryFilter)[keyof typeof LibraryFilter],
    NoteTaskStatusValue
  >
> = {
  [LibraryFilter.Todo]: NoteTaskStatus.Todo,
  [LibraryFilter.InProgress]: NoteTaskStatus.InProgress,
  [LibraryFilter.Blocked]: NoteTaskStatus.Blocked,
  [LibraryFilter.Completed]: NoteTaskStatus.Done,
}

const TASK_STATUS_FILTER_TOKENS: Record<string, NoteTaskStatusValue> = {
  'blocked': NoteTaskStatus.Blocked,
  'completed': NoteTaskStatus.Done,
  'done': NoteTaskStatus.Done,
  'in-progress': NoteTaskStatus.InProgress,
  'inprogress': NoteTaskStatus.InProgress,
  'todo': NoteTaskStatus.Todo,
}

export function parseNotesSearchQuery(rawQuery?: string): NotesQuery {
  if (!rawQuery) {
    return {}
  }

  const words = rawQuery.trim().split(/\s+/).filter(Boolean)
  const remainingWords: string[] = []
  const parsed: NotesQuery = {}

  for (const word of words) {
    const lower = word.toLowerCase()
    if (lower === 'due:today') {
      parsed.propertyDue = 'today'
      parsed.propertyStatusNot = 'done'
      parsed.propertyType = 'task'
      delete parsed.propertyTypeNot
      continue
    }
    if (lower === 'due:upcoming') {
      parsed.propertyDue = 'upcoming'
      parsed.propertyStatusNot = 'done'
      parsed.propertyType = 'task'
      delete parsed.propertyTypeNot
      continue
    }
    if (lower.startsWith('status:')) {
      const token = lower.slice('status:'.length)
      const status = TASK_STATUS_FILTER_TOKENS[token]
      if (status) {
        parsed.propertyStatus = status
        parsed.propertyType = 'task'
        delete parsed.propertyTypeNot
        continue
      }
    }
    remainingWords.push(word)
  }

  if (remainingWords.length) {
    parsed.search = remainingWords.join(' ')
  }

  return parsed
}

export function getLibraryFilterQuery(
  filter?: (typeof LibraryFilter)[keyof typeof LibraryFilter],
): NotesQuery {
  if (filter === LibraryFilter.Favorites) {
    return { isFavorites: 1, propertyTypeNot: 'task' }
  }
  if (filter === LibraryFilter.Trash) {
    return { isDeleted: 1, propertyTypeNot: 'task' }
  }
  if (filter === LibraryFilter.All) {
    return { isDeleted: 0, propertyTypeNot: 'task' }
  }
  if (filter === LibraryFilter.Inbox) {
    return { isInbox: 1, propertyTypeNot: 'task' }
  }
  if (filter === LibraryFilter.Tasks) {
    return { propertyType: 'task' }
  }
  if (filter === LibraryFilter.TasksInbox) {
    return { isInbox: 1, propertyType: 'task' }
  }
  if (filter === LibraryFilter.TasksFavorites) {
    return { isFavorites: 1, propertyType: 'task' }
  }
  if (filter === LibraryFilter.TasksTrash) {
    return { isDeleted: 1, propertyType: 'task' }
  }
  if (filter === LibraryFilter.Today) {
    return {
      propertyDue: 'today',
      propertyStatusNot: 'done',
      propertyType: 'task',
    }
  }
  if (filter === LibraryFilter.Upcoming) {
    return {
      propertyDue: 'upcoming',
      propertyStatusNot: 'done',
      propertyType: 'task',
    }
  }
  const requiredStatus = filter
    ? LIBRARY_FILTER_REQUIRED_TASK_STATUS[filter]
    : undefined
  if (requiredStatus) {
    return {
      propertyStatus: requiredStatus,
      propertyType: 'task',
    }
  }

  return {}
}

const queryByLibraryOrFolderOrSearch = computed(() => {
  const query: NotesQuery = {}

  if (notesState.tagId) {
    query.tagId = notesState.tagId
  }
  else if (notesState.folderId) {
    query.folderId = notesState.folderId
  }
  else {
    Object.assign(query, getLibraryFilterQuery(notesState.libraryFilter))
  }

  if (isSearch.value && searchQuery.value) {
    const parsedSearch = parseNotesSearchQuery(searchQuery.value)
    if (parsedSearch.propertyType !== undefined) {
      delete query.propertyTypeNot
    }
    Object.assign(query, parsedSearch)
  }

  return query
})

const isEmpty = computed(() => {
  if (isSearch.value) {
    return notesBySearch.value?.length === 0
  }

  return notes.value?.length === 0
})

const isNotesLoading = computed(() => notesLoadingCounter.value > 0)

function clearNotesLoadingVisibilityTimer() {
  if (!notesLoadingVisibilityTimer) {
    return
  }

  clearTimeout(notesLoadingVisibilityTimer)
  notesLoadingVisibilityTimer = undefined
}

watch(
  isNotesLoading,
  (loading) => {
    if (loading) {
      if (isNotesLoadingVisible.value || notesLoadingVisibilityTimer) {
        return
      }

      notesLoadingVisibilityTimer = setTimeout(() => {
        notesLoadingVisibilityTimer = undefined

        if (notesLoadingCounter.value > 0) {
          isNotesLoadingVisible.value = true
        }
      }, NOTES_LOADING_VISIBILITY_DELAY_MS)

      return
    }

    clearNotesLoadingVisibilityTimer()
    isNotesLoadingVisible.value = false
  },
  { immediate: true },
)

// --- Utility ---

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getNextIndexedName(baseName: string, existingNames: string[]): string {
  const normalizedBase = baseName.trim()
  const indexedNameRe = new RegExp(
    `^${escapeRegExp(normalizedBase)}(?:\\s+(\\d+))?$`,
    'i',
  )

  let maxIndex = 0

  existingNames.forEach((name) => {
    const match = name.trim().match(indexedNameRe)
    if (!match) {
      return
    }

    const index = match[1] ? Number(match[1]) : 0
    if (Number.isFinite(index)) {
      maxIndex = Math.max(maxIndex, index)
    }
  })

  return `${normalizedBase} ${maxIndex + 1}`
}

function hasDisplayedNote(noteId: number): boolean {
  const source = isSearch.value ? notesBySearch.value : notes.value
  return source?.some(note => note.id === noteId) ?? false
}

function selectFirstNoteIfCurrentSelectionIsMissing(previousNoteId?: number) {
  if (
    previousNoteId !== undefined
    && notesState.noteId === previousNoteId
    && !hasDisplayedNote(previousNoteId)
  ) {
    selectFirstNote()
  }
}

function isTaskCreatePayload(payload?: CreateNotePayload): boolean {
  return payload?.properties?.type === 'task'
}

function ensureCreateResultCanBeListed(payload?: CreateNotePayload) {
  const isTask = isTaskCreatePayload(payload)
  const taskStatus
    = typeof payload?.properties?.status === 'string'
      ? payload.properties.status
      : NoteTaskStatus.Todo
  const filter = notesState.libraryFilter
  const filterQuery = getLibraryFilterQuery(filter)
  const requiredStatus = filter
    ? LIBRARY_FILTER_REQUIRED_TASK_STATUS[filter]
    : undefined
  const isTaskLibrary = filterQuery.propertyType === 'task'
  const isNoteOnlyLibrary = filterQuery.propertyTypeNot === 'task'

  if (
    isTask
    && (isNoteOnlyLibrary
      || filter === LibraryFilter.TasksFavorites
      || filter === LibraryFilter.TasksTrash
      || filter === LibraryFilter.Today
      || filter === LibraryFilter.Upcoming
      || (requiredStatus !== undefined && taskStatus !== requiredStatus))
  ) {
    notesState.libraryFilter = LibraryFilter.Tasks
    return
  }

  if (
    !isTask
    && (filter === LibraryFilter.Trash
      || filter === LibraryFilter.Favorites
      || isTaskLibrary)
  ) {
    notesState.libraryFilter = LibraryFilter.All
  }
}

async function getNoteNamesForCreate(
  folderId: number | null,
): Promise<string[]> {
  const query: NotesQuery = { isDeleted: 0 }
  if (folderId !== null) {
    query.folderId = folderId
  }
  else {
    query.isInbox = 1
  }
  const { data: responseData } = await api.notes.getNotes(query)
  const data = responseData as NotesResponse

  return data
    .filter(note => (note.folder?.id ?? null) === folderId)
    .map(note => note.name)
}

// --- CRUD ---

export async function getNotes(query?: NotesQuery) {
  return withNotesLoading(async () => {
    // Защита от гонки ответов: применяется только самый свежий запрос.
    const requestToken = ++notesRequestToken
    const forSearch = isSearch.value
    const resolvedQuery = {
      ...(query || queryByLibraryOrFolderOrSearch.value),
      ...getContentSortQuery('notes'),
    }

    if (
      hideCompletedTasksInFolders.value
      && (resolvedQuery.folderId !== undefined
        || (!isTasksKanbanActive.value
          && resolvedQuery.propertyType === 'task'
          && resolvedQuery.propertyStatus === undefined
          && resolvedQuery.propertyStatusNot === undefined))
    ) {
      resolvedQuery.hideCompletedTasks = 1
    }

    const finishBenchmark = benchmarkStart(
      'notes',
      'list',
      resolvedQuery.search,
    )
    try {
      const { data: responseData } = await api.notes.getNotes(resolvedQuery)

      if (requestToken !== notesRequestToken) {
        finishBenchmark('superseded')
        return false
      }

      const data = responseData as NotesResponse

      if (forSearch) {
        notesBySearch.value = data
      }
      else {
        notes.value = data
      }
      finishBenchmark()
      return true
    }
    catch (error) {
      finishBenchmark('error')
      throw error
    }
  })
}

async function withNotesLoading<T>(loader: () => Promise<T>): Promise<T> {
  notesLoadingCounter.value += 1

  try {
    return await loader()
  }
  finally {
    notesLoadingCounter.value = Math.max(0, notesLoadingCounter.value - 1)
  }
}

async function createNote(payload?: CreateNotePayload) {
  try {
    const targetFolderId = notesState.folderId || null
    const existingNames = await getNoteNamesForCreate(targetFolderId)
    const requestedName = payload?.name?.trim()
    const hasRequestedName = existingNames.some(
      name => name.trim().toLowerCase() === requestedName?.toLowerCase(),
    )
    const nextNoteName
      = requestedName && !hasRequestedName
        ? requestedName
        : getNextIndexedName(
            requestedName || i18n.t('notes.untitled'),
            existingNames,
          )

    markPersistedStorageMutation()
    const { data } = await api.notes.postNotes({
      name: nextNoteName,
      folderId: targetFolderId,
      ...(payload?.properties ? { properties: payload.properties } : {}),
    })

    useDonations().incrementCreated('notes')

    ensureCreateResultCanBeListed(payload)

    await getNotes(queryByLibraryOrFolderOrSearch.value)

    return Number(data.id)
  }
  catch (error) {
    console.error(error)
  }
}

async function createNoteAndSelect(payload?: CreateNotePayload) {
  notesCreateKind.value = 'note'
  await createNoteWithPayloadAndSelect(payload)
}

async function createTaskAndSelect(payload?: CreateNotePayload) {
  notesCreateKind.value = 'task'
  const defaultStatus
    = !notesState.folderId && !notesState.tagId && notesState.libraryFilter
      ? (LIBRARY_FILTER_REQUIRED_TASK_STATUS[notesState.libraryFilter]
        ?? NoteTaskStatus.Todo)
      : NoteTaskStatus.Todo
  await createNoteWithPayloadAndSelect({
    ...payload,
    properties: {
      status: defaultStatus,
      ...payload?.properties,
      type: 'task',
    },
  })
}

async function createNoteBySelectedKindAndSelect() {
  if (notesCreateKind.value === 'task') {
    await createTaskAndSelect()
    return
  }

  await createNoteAndSelect()
}

async function createNoteWithPayloadAndSelect(payload?: CreateNotePayload) {
  const id = await createNote(payload)

  if (id) {
    selectNote(id)
  }
  else {
    selectFirstNote()
  }

  await focusNoteNameInput()
}

async function duplicateNote(noteId: number) {
  try {
    // Список не содержит контент заметки — источник копии загружается по id.
    const { data: sourceData } = await api.notes.getNotesById(String(noteId))
    const source = sourceData as NoteFullRecord

    if (source.pendingCloudDownload) {
      useSonner().sonner({
        id: 'cloud-file-not-ready',
        message: i18n.t('messages:warning.cloudFileNotReady'),
        type: 'warning',
      })
      return
    }

    if (source.isDeleted) {
      return
    }

    const folderId = source.folder?.id ?? null
    const siblingNames = await getNoteNamesForCreate(folderId)
    const copyBaseName = `${source.name} - copy`
    const name = siblingNames.some(
      sibling => sibling.trim().toLowerCase() === copyBaseName.toLowerCase(),
    )
      ? getNextIndexedName(copyBaseName, siblingNames)
      : copyBaseName

    markPersistedStorageMutation()
    const { data } = await api.notes.postNotes({
      folderId,
      name,
      properties: source.properties,
    })
    const id = Number(data.id)

    await api.notes.patchNotesById(String(id), {
      description: source.description,
    })
    await api.notes.patchNotesByIdContent(String(id), {
      content: source.content,
    })

    for (const tag of source.tags) {
      await api.notes.postNotesByIdTagsByTagId(String(id), String(tag.id))
    }

    ensureCreateResultCanBeListed({ properties: source.properties })
    await getNotes(queryByLibraryOrFolderOrSearch.value)

    return id
  }
  catch (error) {
    console.error(error)
  }
}

// Поля, влияющие на состав текущего списка: после их изменения нужен refetch.
function isNoteListMembershipAffecting(data: NotesUpdate) {
  return (
    data.folderId !== undefined
    || data.isDeleted !== undefined
    || data.isFavorites !== undefined
  )
}

function patchNoteInCollections(noteId: number, data: NotesUpdate) {
  const now = Date.now()

  function apply(collection?: NotesResponse) {
    if (!collection) {
      return collection
    }

    const index = collection.findIndex(n => n.id === noteId)
    if (index === -1) {
      return collection
    }

    const next = [...collection]
    next[index] = {
      ...next[index],
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined
        ? { description: data.description }
        : {}),
      updatedAt: now,
    }
    return next
  }

  notes.value = apply(notes.value)
  notesBySearch.value = apply(notesBySearch.value)

  const record = selectedNoteRecord.value
  if (record?.id === noteId) {
    const updatedRecord = {
      ...record,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined
        ? { description: data.description }
        : {}),
      updatedAt: now,
    }
    selectedNoteRecord.value = updatedRecord
    if (displayedNoteRecord.value?.id === noteId)
      displayedNoteRecord.value = updatedRecord
  }
}

async function updateNote(noteId: number, data: NotesUpdate) {
  markPersistedStorageMutation()
  await api.notes.patchNotesById(String(noteId), data)

  if (isNoteListMembershipAffecting(data)) {
    await getNotes(queryByLibraryOrFolderOrSearch.value)
    await refreshSelectedNote()
    return
  }

  // Переименование/описание не меняют состав списка — обновляем точечно.
  patchNoteInCollections(noteId, data)
}

async function updateNotes(noteIds: number[], data: NotesUpdate[]) {
  markPersistedStorageMutation()

  // Ошибка одного элемента (например 503 на pending-записи) не прерывает
  // batch: остальные применяются, список обновляется в любом случае, о
  // пропуске сообщает общий 503-тост API-клиента.
  const results = await Promise.allSettled(
    noteIds.map((noteId, index) =>
      api.notes.patchNotesById(String(noteId), data[index]),
    ),
  )
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(result.reason)
    }
  })

  await getNotes(queryByLibraryOrFolderOrSearch.value)
  await refreshSelectedNote()
}

async function updateNoteProperties(
  noteId: number,
  data: NotePropertiesUpdate,
) {
  const previousNoteId = notesState.noteId

  markPersistedStorageMutation()
  await api.notes.patchNotesByIdProperties(String(noteId), data)
  await getNotes(queryByLibraryOrFolderOrSearch.value)
  selectFirstNoteIfCurrentSelectionIsMissing(previousNoteId)
  if (notesState.noteId === previousNoteId) {
    await refreshSelectedNote()
  }
}

async function deleteNote(noteId: number) {
  markPersistedStorageMutation()
  await api.notes.deleteNotesById(String(noteId))
  await getNotes(queryByLibraryOrFolderOrSearch.value)
}

async function deleteNotes(noteIds: number[]) {
  markPersistedStorageMutation()

  // Ошибка одного элемента не прерывает batch: остальные применяются,
  // список обновляется в любом случае.
  const results = await Promise.allSettled(
    noteIds.map(noteId => api.notes.deleteNotesById(String(noteId))),
  )
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error(result.reason)
    }
  })

  await getNotes(queryByLibraryOrFolderOrSearch.value)
}

async function deleteSelectedNotes(fallbackNote?: NoteRecord) {
  const { confirm } = useDialog()
  const targetIds = getActionTargetIds(fallbackNote?.id)

  if (!targetIds.length) {
    return
  }

  const targetNotes = getActionTargetNotes(targetIds, fallbackNote)

  if (targetIds.length > 1) {
    const isAllSoftDeleted
      = targetNotes.length === targetIds.length
        && targetNotes.every(note => note.isDeleted)

    if (isAllSoftDeleted) {
      const isConfirmed = await confirm({
        title: i18n.t('messages:confirm.deleteConfirmMultipleSnippets', {
          count: targetIds.length,
        }),
        content: i18n.t('messages:warning.noUndo'),
      })

      if (isConfirmed) {
        await deleteNotes(targetIds)
        selectFirstNote()
      }
    }
    else {
      const notesData = targetIds.map(() => ({
        folderId: null,
        isDeleted: 1,
      }))

      await updateNotes(targetIds, notesData)
      selectFirstNote()
    }

    return
  }

  const targetNote = targetNotes[0]

  if (!targetNote) {
    return
  }

  if (!targetNote.isDeleted) {
    await updateNote(targetNote.id, { folderId: null, isDeleted: 1 })

    if (notesState.noteId === targetNote.id) {
      selectFirstNote()
    }

    return
  }

  const isConfirmed = await confirm({
    title: i18n.t('messages:confirm.deletePermanently', {
      name: targetNote.name,
    }),
    content: i18n.t('messages:warning.noUndo'),
  })

  if (!isConfirmed) {
    return
  }

  const wasSelected = notesState.noteId === targetNote.id

  await deleteNote(targetNote.id)

  if (wasSelected) {
    selectFirstNote()
  }
}

async function emptyTrash(
  filterQuery?: Pick<NotesQuery, 'propertyType' | 'propertyTypeNot'>,
) {
  const { confirm } = useDialog()

  const isConfirmed = await confirm({
    title: i18n.t('messages:confirm.emptyTrash'),
    content: i18n.t('messages:warning.noUndo'),
  })

  if (isConfirmed) {
    const resolvedTrashQuery
      = filterQuery
        ?? (notesState.libraryFilter === LibraryFilter.TasksTrash
          ? { propertyType: 'task' }
          : notesState.libraryFilter === LibraryFilter.Trash
            ? { propertyTypeNot: 'task' }
            : undefined)
    await api.notes.deleteNotesTrash(resolvedTrashQuery)
    await getNotes(queryByLibraryOrFolderOrSearch.value)
    selectFirstNote()
  }
}

async function cleanupCompletedTasks(options?: {
  skipConfirm?: boolean
  current?: () => boolean
  captureUndo?: boolean
}): Promise<{
    status: 'done' | 'failed' | 'stale' | 'cancelled'
    count?: number
    receiptId?: string
    persisted?: boolean
  }> {
  const { confirm } = useDialog()
  const { sonner } = useSonner()
  const previousNoteId = notesState.noteId
  const vault = store.preferences.get<string>('storage.vaultPath') ?? ''
  let cleanup: TaskCleanupResult | undefined

  if (!options?.skipConfirm) {
    const isConfirmed = await confirm({
      title: i18n.t('notes.tasks.cleanupConfirmTitle'),
      content: i18n.t('notes.tasks.cleanupConfirmMessage'),
    })

    if (!isConfirmed) {
      return { status: 'cancelled' as const }
    }
  }

  if (
    (options?.current && !options.current())
    || vault !== (store.preferences.get<string>('storage.vaultPath') ?? '')
  ) {
    return { status: 'stale' as const }
  }
  try {
    markPersistedStorageMutation()
    cleanup = options?.captureUndo
      ? await ipc.invoke<{ vault: string }, TaskCleanupResult>(
        'system:tasks-cleanup',
        { vault },
      )
      : {
          status: 'done',
          count: (await api.notes.postNotesTasksCleanup()).data.count,
        }
    const count = cleanup.count
    if (cleanup.status === 'stale')
      return cleanup

    const loaded = await getNotes(queryByLibraryOrFolderOrSearch.value)
    await refreshSelectedNote()
    if (!loaded || selectedNoteRecordStatus.value === 'error')
      return { ...cleanup, status: 'failed', persisted: count > 0 }
    if (options?.current && !options.current())
      return { ...cleanup, status: 'stale', persisted: count > 0 }
    selectFirstNoteIfCurrentSelectionIsMissing(previousNoteId)
    if (cleanup.status === 'failed') {
      sonner({ message: i18n.t('notes.tasks.cleanupError'), type: 'error' })
      return { ...cleanup, persisted: count > 0 }
    }

    sonner({
      message:
        count > 0
          ? i18n.t('notes.tasks.cleanupDone', { count })
          : i18n.t('notes.tasks.cleanupEmpty'),
      type: 'success',
    })
    return { ...cleanup, status: 'done', persisted: count > 0 }
  }
  catch (error) {
    console.error(error)
    sonner({ message: i18n.t('notes.tasks.cleanupError'), type: 'error' })
    return {
      ...cleanup,
      status: 'failed',
      persisted: (cleanup?.count ?? 0) > 0,
    }
  }
}

// --- Tag operations ---

async function addTagToNote(tagId: number, noteId: number) {
  try {
    await api.notes.postNotesByIdTagsByTagId(String(noteId), String(tagId))
    await getNotes(queryByLibraryOrFolderOrSearch.value)
    await refreshSelectedNote()
  }
  catch (error) {
    console.error(error)
  }
}

async function deleteTagFromNote(tagId: number, noteId: number) {
  try {
    await api.notes.deleteNotesByIdTagsByTagId(String(noteId), String(tagId))
    await getNotes(queryByLibraryOrFolderOrSearch.value)
    await refreshSelectedNote()
  }
  catch (error) {
    console.error(error)
  }
}

// --- Selection ---

export function selectNote(noteId: number, withShift = false) {
  if (!withShift) {
    selectedNoteIds.value = [noteId]
    notesState.noteId = noteId
    return
  }

  if (notesState.noteId !== undefined) {
    const source = isSearch.value ? notesBySearch.value : notes.value

    if (source?.length) {
      const orderedIds = source.map(note => note.id)
      const rangeSelection = getContiguousSelection(
        orderedIds,
        notesState.noteId,
        noteId,
      )

      if (rangeSelection.length) {
        selectedNoteIds.value = rangeSelection
        lastSelectedNoteId.value = noteId
      }
    }
  }
  else {
    selectedNoteIds.value = [noteId]
    lastSelectedNoteId.value = noteId
    notesState.noteId = noteId
  }
}

function clearNoteSelection() {
  notesState.noteId = undefined
  selectedNoteIds.value = []
  lastSelectedNoteId.value = undefined
  selectedNoteRecord.value = undefined
  displayedNoteRecord.value = undefined
  selectedNoteRecordStatus.value = 'idle'
}

export function selectFirstNote() {
  let firstNote: NoteRecord | undefined

  if (isSearch.value) {
    firstNote = notesBySearch.value?.[0]
  }
  else {
    firstNote = notes.value?.[0]
  }

  if (firstNote) {
    notesState.noteId = firstNote.id
    selectedNoteIds.value = [firstNote.id]
    lastSelectedNoteId.value = firstNote.id
  }
  else {
    clearNoteSelection()
  }
}

function clearNotes() {
  notes.value = []
  notesBySearch.value = []
}

function clearNotesState() {
  clearNotes()
  clearNoteSelection()
}

export function useNotes() {
  const { hasBusyNoteContentUpdates, updateNoteContent } = useNoteContent()

  return {
    addTagToNote,
    cleanupCompletedTasks,
    clearNotes,
    clearNotesState,
    createNote,
    createNoteAndSelect,
    createNoteBySelectedKindAndSelect,
    createTaskAndSelect,
    deleteNote,
    deleteNotes,
    deleteSelectedNotes,
    deleteTagFromNote,
    duplicateNote,
    displayedNoteRecord,
    emptyTrash,
    getNotes,
    hasBusyNoteContentUpdates,
    isEmpty,
    isNotesLoading,
    isNotesLoadingVisible,
    isRestoreStateBlocked,
    isSearch,
    lastSelectedNoteId,
    notes,
    refreshSelectedNote,
    retrySelectedNote,
    selectedNoteRecordStatus,
    selectedNote,
    selectedNoteIds,
    selectedNotes,
    selectFirstNote,
    selectNote,
    updateNote,
    updateNoteProperties,
    updateNotes,
    updateNoteContent,
    withNotesLoading,
  }
}
