import { LibraryFilter } from '@/composables/types'
import { router, RouterName } from '@/router'
import { api } from '@/services/api'
import { useNoteFolders } from './useNoteFolders'
import { getLibraryFilterQuery, useNotes } from './useNotes'
import { useNotesApp } from './useNotesApp'
import { useNoteSearch } from './useNoteSearch'

const { clearSearch } = useNoteSearch()
const { getNotes, selectFirstNote, selectNote } = useNotes()
const { notesState } = useNotesApp()

export function useNotesWorkspaceNavigation() {
  async function openNotesLibrary(
    id: (typeof LibraryFilter)[keyof typeof LibraryFilter],
    current: () => boolean = () => true,
  ) {
    if (!current())
      return false
    if (router.currentRoute.value.name !== RouterName.notesSpace)
      await router.push({ name: RouterName.notesSpace })
    if (!current() || router.currentRoute.value.name !== RouterName.notesSpace)
      return false
    const { notesState } = useNotesApp()
    const {
      getNotes,
      selectFirstNote,
      withNotesLoading,
      isRestoreStateBlocked,
    } = useNotes()
    return withNotesLoading(async () => {
      isRestoreStateBlocked.value = true
      useNoteSearch().clearSearch()
      notesState.libraryFilter = id
      useNoteFolders().clearFolderSelection()
      notesState.tagId = undefined
      const loaded = await getNotes(getLibraryFilterQuery(id))

      if (
        !loaded
        || !current()
        || router.currentRoute.value.name !== RouterName.notesSpace
        || notesState.libraryFilter !== id
      ) {
        return false
      }
      selectFirstNote()
      return true
    })
  }

  async function openNoteInNotesWorkspaceInternal(noteId: number) {
    const { data: note } = await api.notes.getNotesById(String(noteId))

    await router.push({ name: RouterName.notesSpace })
    clearSearch()
    notesState.tagId = undefined

    if (note.folder) {
      notesState.folderId = note.folder.id
      notesState.libraryFilter = undefined
      await getNotes({ folderId: note.folder.id })
    }
    else {
      const isTask = note.properties?.type === 'task'
      notesState.folderId = undefined
      notesState.libraryFilter = isTask
        ? LibraryFilter.TasksInbox
        : LibraryFilter.Inbox
      await getNotes(getLibraryFilterQuery(notesState.libraryFilter))
    }

    selectNote(noteId)
  }

  async function openNoteWithOptionalRouteHistory(noteId: number) {
    const { useNavigationHistory } = await import(
      '@/composables/useNavigationHistory'
    )
    const { recordNavigation } = useNavigationHistory()

    await recordNavigation(async () => {
      await openNoteInNotesWorkspaceInternal(noteId)
    })
  }

  async function openNoteInNotesWorkspace(noteId: number) {
    await openNoteWithOptionalRouteHistory(noteId)
  }

  async function openNoteFromGraph(noteId: number) {
    await openNoteWithOptionalRouteHistory(noteId)
  }

  async function openTagInNotesWorkspace(
    tagId: number,
    current: () => boolean = () => true,
  ) {
    await router.push({ name: RouterName.notesSpace })
    clearSearch()
    if (!current() || router.currentRoute.value.name !== RouterName.notesSpace)
      return false
    useNoteFolders().clearFolderSelection()
    notesState.libraryFilter = undefined
    notesState.tagId = tagId

    if (
      !(await getNotes({ tagId }))
      || !current()
      || notesState.tagId !== tagId
    ) {
      return false
    }
    selectFirstNote()
    return true
  }

  return {
    openNotesLibrary,
    openNoteFromGraph,
    openNoteInNotesWorkspace,
    openTagInNotesWorkspace,
  }
}
