<script setup lang="ts">
import * as Dialog from '@/components/ui/shadcn/dialog'
import {
  useNotesApp,
  useNoteSearch,
  useNotesSpaceInitialization,
} from '@/composables'
import { i18n, store } from '@/electron'
import { RouterName } from '@/router'
import { useRoute } from 'vue-router'

const {
  isFocusedNoteName,
  isNotesListHidden,
  isNotesSidebarHidden,
  isTasksKanbanActive,
  notesState,
} = useNotesApp()
const { displayedNotes } = useNoteSearch()
const { initNotesSpace } = useNotesSpaceInitialization()
const route = useRoute()

void initNotesSpace()

const kanbanOpenNoteId = ref<number | undefined>()

watch(isTasksKanbanActive, (active) => {
  if (!active) {
    kanbanOpenNoteId.value = undefined
  }
})

watch([displayedNotes, () => notesState.noteId], ([notes, noteId]) => {
  if (kanbanOpenNoteId.value === undefined) {
    return
  }

  if (
    noteId === undefined
    || (notes && !notes.some(note => note.id === kanbanOpenNoteId.value))
  ) {
    kanbanOpenNoteId.value = undefined
  }
})

watch(isFocusedNoteName, (focused) => {
  if (focused && isTasksKanbanActive.value && notesState.noteId !== undefined) {
    kanbanOpenNoteId.value = notesState.noteId
  }
})

const storedThreePanel = store.app.get('notes.layout.threePanel') as
  | number[]
  | undefined

const sidebarWidth
  = storedThreePanel?.length === 2 ? storedThreePanel[0] : undefined
const listWidth = (() => {
  if (storedThreePanel?.length === 2)
    return storedThreePanel[1]
  const twoPanel = store.app.get('notes.layout.twoPanel') as number | undefined
  return twoPanel ?? undefined
})()

function onResizeEnd(sw: number, lw: number) {
  store.app.set('notes.layout.threePanel', [sw, lw])
}

function onTwoPanelResize(lw: number) {
  store.app.set('notes.layout.twoPanel', lw)
}

const isWorkspaceRoute = computed(() => route.name === RouterName.notesSpace)
const isSidebarShown = computed(() => !isNotesSidebarHidden.value)
const isListShown = computed(() =>
  isWorkspaceRoute.value
    ? !isNotesListHidden.value && !isTasksKanbanActive.value
    : false,
)
</script>

<template>
  <LayoutThreeColumn
    :show-sidebar="isSidebarShown"
    :show-list="isListShown"
    :sidebar-width="sidebarWidth"
    :list-width="listWidth"
    @resize-end="onResizeEnd"
    @two-panel-resize="onTwoPanelResize"
  >
    <template #sidebar>
      <NotesSidebar />
    </template>
    <template #list>
      <NotesList />
    </template>
    <template #editor>
      <div
        v-if="isWorkspaceRoute"
        class="flex h-full min-w-0 overflow-hidden"
      >
        <NotesTasksKanban
          v-if="isTasksKanbanActive"
          class="min-w-0 flex-1"
          :active-note-id="kanbanOpenNoteId"
          @open-note="kanbanOpenNoteId = $event"
        />
        <Dialog.Dialog
          v-if="isTasksKanbanActive"
          :open="kanbanOpenNoteId !== undefined"
          @update:open="!$event && (kanbanOpenNoteId = undefined)"
        >
          <Dialog.DialogContent
            data-kanban-editor-dialog
            class="flex h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl [&>[data-notes-editor]>div>div]:pt-0 [&_[data-notes-editor-header]>div:first-child]:pt-2 [&_[data-notes-editor-header]>div:first-child]:pr-10"
            @open-auto-focus="$event.preventDefault()"
            @close-auto-focus="$event.preventDefault()"
          >
            <Dialog.DialogTitle class="sr-only">
              {{ i18n.t('notes.tasks.title') }}
            </Dialog.DialogTitle>
            <Dialog.DialogDescription class="sr-only">
              {{ i18n.t('notes.tasks.kanbanView') }}
            </Dialog.DialogDescription>
            <NotesEditorPane data-notes-editor />
          </Dialog.DialogContent>
        </Dialog.Dialog>
        <div
          v-else
          class="flex h-full min-w-0 flex-1 flex-col overflow-hidden"
        >
          <NotesEditorPane />
        </div>
      </div>
      <RouterView v-else />
    </template>
  </LayoutThreeColumn>
</template>
