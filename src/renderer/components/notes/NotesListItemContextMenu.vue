<script setup lang="ts">
import type {
  NoteExportFormat,
  NoteExportPayload,
  NoteExportResponse,
} from '~/main/types/ipc'
import * as ContextMenu from '@/components/ui/shadcn/context-menu'
import {
  isTaskNote,
  isTaskToday,
  NoteTaskStatus,
  useDialog,
  useDonations,
  useNoteFolders,
  useNotes,
  useNotesApp,
  useSonner,
} from '@/composables'
import { LibraryFilter } from '@/composables/types'
import { i18n, ipc, store } from '@/electron'
import { isMac } from '@/utils'
import { useClipboard } from '@vueuse/core'
import { api } from '~/renderer/services/api'
import { getMermaidSources, renderDiagramPreviews } from './diagramExport'
import { renderDrawingPreviewsFromMarkdown } from './drawingExport'
import { showNoteExportWarnings } from './exportWarnings'

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

interface Props {
  note: NoteRecord
}

const props = defineProps<Props>()

const { focusNoteNameInput, notesState } = useNotesApp()
const { getNoteFolders } = useNoteFolders()

const {
  selectFirstNote,
  selectedNoteIds,
  setTasksToday,
  updateNote,
  updateNoteProperties,
  updateNotes,
  deleteSelectedNotes,
  duplicateNote,
  selectNote,
  selectedNote,
} = useNotes()

const { copy } = useClipboard()
const { confirm } = useDialog()
const { sonner } = useSonner()

const isFavoritesLibrarySelected = computed(
  () =>
    notesState.libraryFilter === LibraryFilter.Favorites
    || notesState.libraryFilter === LibraryFilter.TasksFavorites,
)
const isTasksTodayLibrarySelected = computed(
  () => notesState.libraryFilter === LibraryFilter.TasksToday,
)
const isTodayTask = computed(
  () => isTasksTodayLibrarySelected.value || isTaskToday(props.note),
)

const isTrashLibrarySelected = computed(
  () =>
    notesState.libraryFilter === LibraryFilter.Trash
    || notesState.libraryFilter === LibraryFilter.TasksTrash,
)
const isTask = computed(() => isTaskNote(props.note))
const hasFolder = computed(() => Boolean(props.note.folder))

const revealInFileManagerLabel = computed(() =>
  isMac
    ? i18n.t('action.reveal.inFinder')
    : i18n.t('action.reveal.inFileManager'),
)
const removeFromFolderLabel = computed(() =>
  i18n.t('action.remove.fromFolder', {
    defaultValue: 'Remove from Folder',
  }),
)

// Содержимое ещё в облаке: мутации (запись файла) и копирование тела
// недоступны до докачки; чтение метаданных и ссылки работают.
const isCloudPending = computed(() => props.note.pendingCloudDownload === true)

async function onAddFavorites() {
  const isFavorites = isFavoritesLibrarySelected.value ? 0 : 1

  if (selectedNoteIds.value.length > 1) {
    const notesData = selectedNoteIds.value.map(() => ({ isFavorites }))
    await updateNotes(selectedNoteIds.value, notesData)
  }
  else {
    await updateNote(props.note.id, { isFavorites })
  }

  if (isFavoritesLibrarySelected.value) {
    if (
      selectedNoteIds.value.length > 1
      || notesState.noteId === props.note.id
    ) {
      selectFirstNote()
    }
  }
}

async function onToggleToday() {
  const nextIsToday = !isTodayTask.value
  const targetIds
    = selectedNoteIds.value.length > 1
      && selectedNoteIds.value.includes(props.note.id)
      ? selectedNoteIds.value
      : [props.note.id]

  await setTasksToday(targetIds, nextIsToday)

  if (!nextIsToday && isTasksTodayLibrarySelected.value) {
    if (
      selectedNoteIds.value.length > 1
      || notesState.noteId === props.note.id
    ) {
      selectFirstNote()
    }
  }
}

async function onDelete() {
  await deleteSelectedNotes(props.note)
}

async function onDuplicate() {
  const id = await duplicateNote(props.note.id)

  if (id) {
    selectNote(id)
    await focusNoteNameInput()
  }
}

async function onRestore() {
  if (selectedNoteIds.value.length > 1) {
    const notesData = selectedNoteIds.value.map(() => ({
      folderId: null,
      isDeleted: 0,
    }))
    await updateNotes(selectedNoteIds.value, notesData)
  }
  else {
    await updateNote(props.note.id, { folderId: null, isDeleted: 0 })
  }
}

async function onRemoveFromFolder() {
  if (
    selectedNoteIds.value.length > 1
    && selectedNoteIds.value.includes(props.note.id)
  ) {
    const notesData = selectedNoteIds.value.map(() => ({ folderId: null }))
    await updateNotes(selectedNoteIds.value, notesData)
  }
  else {
    await updateNote(props.note.id, { folderId: null })
  }

  void getNoteFolders(false)

  if (
    notesState.folderId !== undefined
    && (selectedNoteIds.value.length > 1
      || notesState.noteId === props.note.id)
  ) {
    selectFirstNote()
  }
}

function onRevealInFileManager() {
  void ipc.invoke('system:show-note-in-file-manager', props.note.id)
}

function onCopyNoteLink() {
  copy(`masscode://goto?noteId=${props.note.id}`)
}

async function onCopyNoteContent() {
  try {
    // Список не содержит контента — он загружается по id.
    const { data } = await api.notes.getNotesById(String(props.note.id))
    copy(data.content)
    useDonations().incrementCopy('notes')
  }
  catch (error) {
    console.error(error)
  }
}

function showCloudFileNotReadyWarning() {
  sonner({
    message: i18n.t('messages:warning.cloudFileNotReady'),
    type: 'warning',
  })
}

async function onExport(format: NoteExportFormat) {
  const vault = store.preferences.get('storage.vaultPath')
  try {
    let content: string
    if (selectedNote.value?.id === props.note.id) {
      if (selectedNote.value.pendingCloudDownload) {
        showCloudFileNotReadyWarning()
        return
      }

      if (typeof selectedNote.value.content === 'string') {
        content = selectedNote.value.content
      }
      else {
        const { data } = await api.notes.getNotesById(String(props.note.id))
        if (data.pendingCloudDownload) {
          showCloudFileNotReadyWarning()
          return
        }
        content = data.content
      }
    }
    else {
      const { data } = await api.notes.getNotesById(String(props.note.id))
      if (data.pendingCloudDownload) {
        showCloudFileNotReadyWarning()
        return
      }
      content = data.content
    }

    const drawingPreviews = await renderDrawingPreviewsFromMarkdown(content)
    const diagramPreviews = await renderDiagramPreviews(
      getMermaidSources(content),
      Math.max(0, 50 - drawingPreviews.length),
    )
    if (store.preferences.get('storage.vaultPath') !== vault)
      throw new Error('VAULT_CHANGED')
    const result = await ipc.invoke<NoteExportPayload, NoteExportResponse>(
      'fs:export-note',
      {
        content,
        drawingPreviews,
        diagramPreviews,
        format,
        name: props.note.name,
      },
    )

    if (!result.canceled && !showNoteExportWarnings(result.warnings)) {
      sonner({
        message: i18n.t('messages:success.noteExported'),
        type: 'success',
      })
    }
  }
  catch (error) {
    console.error(error)
    sonner({
      message: i18n.t('messages:error.noteExportFailed'),
      type: 'error',
    })
  }
}

async function onConvertToTask() {
  await updateNoteProperties(props.note.id, {
    properties: {
      status: NoteTaskStatus.Todo,
      type: 'task',
    },
  })
}

async function onConvertToNote() {
  const isConfirmed = await confirm({
    title: i18n.t('messages:confirm.convertTaskToNote', {
      name: props.note.name,
    }),
    content: i18n.t('messages:warning.taskPropertiesRemoved'),
  })

  if (!isConfirmed) {
    return
  }

  await updateNoteProperties(props.note.id, {
    unset: ['type', 'status', 'priority', 'due', 'today', 'todayOrder'],
  })
}
</script>

<template>
  <ContextMenu.ContextMenuContent>
    <template v-if="!isTrashLibrarySelected">
      <ContextMenu.ContextMenuItem
        :disabled="isCloudPending"
        @click="onAddFavorites"
      >
        {{
          isFavoritesLibrarySelected
            ? i18n.t("action.remove.fromFavorites")
            : i18n.t("action.add.toFavorites")
        }}
      </ContextMenu.ContextMenuItem>
      <ContextMenu.ContextMenuItem
        v-if="isTask"
        data-note-toggle-today
        :disabled="isCloudPending"
        @click="onToggleToday"
      >
        {{
          isTodayTask
            ? i18n.t("action.remove.fromToday", {
              defaultValue: "Remove from Today",
            })
            : i18n.t("action.add.toToday", {
              defaultValue: "Add to Today",
            })
        }}
      </ContextMenu.ContextMenuItem>
      <ContextMenu.ContextMenuItem
        v-if="!isTask"
        :disabled="isCloudPending"
        @click="onConvertToTask"
      >
        {{ i18n.t("notes.tasks.convertToTask") }}
      </ContextMenu.ContextMenuItem>
      <ContextMenu.ContextMenuItem
        v-else
        :disabled="isCloudPending"
        @click="onConvertToNote"
      >
        {{ i18n.t("notes.tasks.convertToNote") }}
      </ContextMenu.ContextMenuItem>
      <ContextMenu.ContextMenuItem
        v-if="hasFolder"
        data-note-remove-from-folder
        :disabled="isCloudPending"
        @click="onRemoveFromFolder"
      >
        {{ removeFromFolderLabel }}
      </ContextMenu.ContextMenuItem>
      <ContextMenu.ContextMenuSeparator />
    </template>
    <ContextMenu.ContextMenuItem @click="onRevealInFileManager">
      {{ revealInFileManagerLabel }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuItem
      :disabled="isCloudPending"
      @click="onCopyNoteContent"
    >
      {{ i18n.t("action.copy.note") }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuItem @click="onCopyNoteLink">
      {{ i18n.t("action.copy.noteLink") }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuSeparator />
    <ContextMenu.ContextMenuItem
      :disabled="isCloudPending || selectedNoteIds.length > 1"
      @click="onExport('html')"
    >
      {{ i18n.t("action.export.toHtml") }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuItem
      :disabled="isCloudPending || selectedNoteIds.length > 1"
      @click="onExport('pdf')"
    >
      {{ i18n.t("action.export.toPdf") }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuSeparator />
    <ContextMenu.ContextMenuItem
      v-if="!isTrashLibrarySelected"
      :disabled="isCloudPending || selectedNoteIds.length > 1"
      @click="onDuplicate"
    >
      {{ i18n.t("action.duplicate") }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuItem
      :disabled="isCloudPending"
      @click="onDelete"
    >
      {{
        isTrashLibrarySelected
          ? i18n.t("action.delete.common")
          : i18n.t("action.move.toTrash")
      }}
    </ContextMenu.ContextMenuItem>
    <ContextMenu.ContextMenuItem
      v-if="isTrashLibrarySelected"
      :disabled="isCloudPending"
      @click="onRestore"
    >
      {{ i18n.t("action.restore") }}
    </ContextMenu.ContextMenuItem>
  </ContextMenu.ContextMenuContent>
</template>
