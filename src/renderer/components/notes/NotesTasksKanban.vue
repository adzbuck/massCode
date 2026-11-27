<script setup lang="ts">
import type { NoteTaskStatusValue } from '@/composables'
import {
  createTaskCompletionPatch,
  createTaskStatusPatch,
  getTaskStatus,
  groupTasksByStatus,
  isNoteTaskStatus,
  NoteTaskStatus,
  TASK_KANBAN_STATUSES,
  useDeleteShortcut,
  useNotes,
  useNotesApp,
  useNoteSearch,
} from '@/composables'
import { i18n } from '@/electron'
import { cn } from '@/utils'
import { onClickOutside } from '@vueuse/core'
import {
  Circle,
  CircleAlert,
  CircleCheck,
  Clock,
  LoaderCircle,
  Plus,
} from 'lucide-vue-next'

const props = defineProps<{
  activeNoteId?: number
}>()

const emit = defineEmits<{
  openNote: [noteId: number]
}>()

const {
  createTaskAndSelect,
  deleteSelectedNotes,
  isNotesLoading,
  isNotesLoadingVisible,
  selectNote,
  updateNoteProperties,
} = useNotes()
const { displayedNotes } = useNoteSearch()
const {
  focusedNoteId,
  highlightedNoteIds,
  isNotesSidebarHidden,
  notesState,
  toggleNotesSidebar,
} = useNotesApp()

const boardRef = ref<HTMLDivElement>()
const draggedNoteId = ref<number | undefined>()
const dragOverStatus = ref<NoteTaskStatusValue | undefined>()

function clearNoteInteractionState() {
  focusedNoteId.value = undefined
  highlightedNoteIds.value.clear()
}

onClickOutside(boardRef, clearNoteInteractionState)

useDeleteShortcut({
  rootSelector: '[data-tasks-kanban-board]',
  isEnabled: () => focusedNoteId.value !== undefined,
  onDelete: deleteSelectedNotes,
})

const columns = computed(() =>
  TASK_KANBAN_STATUSES.map(status => ({
    status,
    label: i18n.t(`notes.tasks.status.${status}`),
  })),
)

const groupedTasks = computed(() => groupTasksByStatus(displayedNotes.value))

const sidebarActionTooltip = computed(() =>
  i18n.t(
    isNotesSidebarHidden.value
      ? 'action.showPrimarySidebar'
      : 'action.hidePrimarySidebar',
  ),
)

async function moveTaskToStatus(
  noteId: number,
  targetStatus: NoteTaskStatusValue,
) {
  const note = (displayedNotes.value ?? []).find(item => item.id === noteId)
  if (!note || getTaskStatus(note) === targetStatus) {
    return
  }

  await updateNoteProperties(noteId, createTaskStatusPatch(targetStatus))
}

function onDragStart(noteId: number, event: DragEvent) {
  draggedNoteId.value = noteId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(noteId))
    event.dataTransfer.setData('noteIds', JSON.stringify([noteId]))
  }
}

function onDragEnd() {
  draggedNoteId.value = undefined
  dragOverStatus.value = undefined
}

function onDragOver(status: NoteTaskStatusValue, event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverStatus.value = status
}

function onDragLeave(status: NoteTaskStatusValue, event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  if (dragOverStatus.value === status) {
    dragOverStatus.value = undefined
  }
}

async function onDrop(status: NoteTaskStatusValue, event: DragEvent) {
  const rawId = event.dataTransfer?.getData('text/plain')
  const parsedId = rawId ? Number(rawId) : draggedNoteId.value
  draggedNoteId.value = undefined
  dragOverStatus.value = undefined

  if (
    typeof parsedId !== 'number'
    || !Number.isFinite(parsedId)
    || !isNoteTaskStatus(status)
  ) {
    return
  }

  await moveTaskToStatus(parsedId, status)
}

async function toggleTaskCompletion(note: {
  id: number
  properties: Record<string, unknown>
}) {
  await updateNoteProperties(note.id, createTaskCompletionPatch(note))
}

async function onCardClick(noteId: number) {
  focusedNoteId.value = noteId
  await selectNote(noteId)
  emit('openNote', noteId)
}

async function createTaskInColumn(status: NoteTaskStatusValue) {
  await createTaskAndSelect(createTaskStatusPatch(status))
  if (notesState.noteId !== undefined) {
    emit('openNote', notesState.noteId)
  }
}
</script>

<template>
  <div
    ref="boardRef"
    data-tasks-kanban-board
    class="flex h-full min-w-0 flex-col overflow-hidden pt-[var(--content-top-offset)]"
    @click.capture="clearNoteInteractionState"
  >
    <div class="border-border flex items-center justify-between border-b pr-2 pb-1">
      <NotesListHeader embedded />
      <div class="ml-2 flex h-7 shrink-0 items-center gap-0.5">
        <UiActionButton
          :tooltip="sidebarActionTooltip"
          shortcut="CommandOrControl+B"
          :active="isNotesSidebarHidden"
          @click="toggleNotesSidebar"
        >
          <UiPanelIcon
            side="left"
            :open="!isNotesSidebarHidden"
          />
        </UiActionButton>
      </div>
    </div>

    <div
      v-if="isNotesLoading && !displayedNotes?.length && isNotesLoadingVisible"
      class="text-muted-foreground flex flex-1 items-center justify-center"
    >
      <LoaderCircle class="h-4 w-4 animate-spin" />
    </div>

    <div
      v-else
      class="scrollbar grid min-h-0 flex-1 auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto p-3"
    >
      <div
        v-for="column in columns"
        :key="column.status"
        :data-kanban-column="column.status"
        :class="
          cn(
            'bg-muted/30 border-border flex min-h-0 flex-col rounded-lg border transition-colors',
            dragOverStatus === column.status && 'border-primary/50 bg-accent/40',
          )
        "
        @dragover.prevent="onDragOver(column.status, $event)"
        @dragenter.prevent="dragOverStatus = column.status"
        @dragleave="onDragLeave(column.status, $event)"
        @drop.prevent="onDrop(column.status, $event)"
      >
        <div class="border-border flex items-center justify-between border-b px-3 py-2">
          <div class="flex min-w-0 items-center gap-2">
            <Circle
              v-if="column.status === NoteTaskStatus.Todo"
              class="text-muted-foreground h-3.5 w-3.5 shrink-0"
            />
            <Clock
              v-else-if="column.status === NoteTaskStatus.InProgress"
              class="text-primary h-3.5 w-3.5 shrink-0"
            />
            <CircleAlert
              v-else-if="column.status === NoteTaskStatus.Blocked"
              class="text-destructive h-3.5 w-3.5 shrink-0"
            />
            <CircleCheck
              v-else
              class="text-muted-foreground h-3.5 w-3.5 shrink-0"
            />
            <UiText
              variant="sm"
              weight="medium"
              class="truncate"
            >
              {{ column.label }}
            </UiText>
            <UiText
              as="span"
              variant="xs"
              muted
              class="bg-muted rounded-full px-1.5 py-0.5 tabular-nums"
            >
              {{ groupedTasks[column.status].length }}
            </UiText>
          </div>
          <UiActionButton
            :data-kanban-add="column.status"
            :tooltip="i18n.t('action.new.task')"
            @click="createTaskInColumn(column.status)"
          >
            <Plus class="h-3.5 w-3.5" />
          </UiActionButton>
        </div>

        <div class="scrollbar flex-1 space-y-2 overflow-y-auto p-2">
          <NotesTasksKanbanCard
            v-for="note in groupedTasks[column.status]"
            :key="note.id"
            :note="note"
            :active="props.activeNoteId === note.id || notesState.noteId === note.id"
            :dragging="draggedNoteId === note.id"
            @open="onCardClick"
            @toggle-complete="toggleTaskCompletion"
            @dragstart="onDragStart"
            @dragend="onDragEnd"
          />

          <div
            v-if="!groupedTasks[column.status].length"
            class="flex h-24 items-center justify-center rounded-md border border-dashed"
          >
            <UiText
              variant="xs"
              muted
            >
              {{ i18n.t('notes.tasks.emptyColumn') }}
            </UiText>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
