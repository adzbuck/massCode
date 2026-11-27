<script setup lang="ts">
import { Checkbox } from '@/components/ui/shadcn/checkbox'
import * as ContextMenu from '@/components/ui/shadcn/context-menu'
import {
  getTaskDue,
  getTaskPriority,
  getTaskStatus,
  isTaskToday,
  NoteTaskPriority,
  NoteTaskStatus,
  useNotes,
  useNotesApp,
} from '@/composables'
import { useDateFormat } from '@/composables/useDateFormat'
import { i18n } from '@/electron'
import { cn } from '@/utils'
import { isBefore, isValid, parseISO, startOfDay } from 'date-fns'
import { CalendarIcon, Flag, Folder, Star, Sun } from 'lucide-vue-next'
import {
  getTaskPriorityBorderClass,
  getTaskPriorityFlagClass,
} from './taskPriorityStyle'

interface KanbanTaskTag {
  id: number
  name: string
}

interface KanbanTaskFolder {
  id: number
  name: string
}

export interface KanbanTaskNote {
  id: number
  name: string
  description: string | null
  properties: Record<string, unknown>
  tags: KanbanTaskTag[]
  folder: KanbanTaskFolder | null
  isFavorites: number
  isDeleted: number
  pendingCloudDownload?: boolean
  createdAt: number
  updatedAt: number
}

const props = defineProps<{
  note: KanbanTaskNote
  active?: boolean
  dragging?: boolean
}>()

const emit = defineEmits<{
  open: [noteId: number]
  toggleComplete: [note: KanbanTaskNote]
  dragstart: [noteId: number, event: DragEvent]
  dragend: []
}>()

const { formatDate } = useDateFormat()
const { highlightedFolderIds, highlightedNoteIds } = useNotesApp()
const { selectedNoteIds } = useNotes()

const isHighlighted = computed(() =>
  highlightedNoteIds.value.has(props.note.id),
)
const isDone = computed(() => getTaskStatus(props.note) === NoteTaskStatus.Done)
const isInToday = computed(() => isTaskToday(props.note))
const priority = computed(() => getTaskPriority(props.note))
const priorityBorderClass = computed(() =>
  getTaskPriorityBorderClass(priority.value),
)
const due = computed(() => getTaskDue(props.note))

function onContextMenu() {
  highlightedFolderIds.value.clear()
  highlightedNoteIds.value.clear()
  highlightedNoteIds.value.add(props.note.id)

  if (selectedNoteIds.value.length > 1) {
    selectedNoteIds.value.forEach(id => highlightedNoteIds.value.add(id))
  }
}

const priorityLabels = computed<Record<string, string>>(() => ({
  [NoteTaskPriority.Low]: i18n.t('notes.tasks.priority.low'),
  [NoteTaskPriority.Medium]: i18n.t('notes.tasks.priority.medium'),
  [NoteTaskPriority.High]: i18n.t('notes.tasks.priority.high'),
}))

function parseDueDate(value: string) {
  if (!value)
    return undefined
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : undefined
}

const isOverdue = computed(() => {
  if (isDone.value)
    return false
  const parsed = parseDueDate(due.value)
  if (!parsed)
    return false
  return isBefore(parsed, startOfDay(new Date()))
})

const formattedDueDate = computed(() => {
  const parsed = parseDueDate(due.value)
  return parsed ? formatDate(parsed) : due.value
})
</script>

<template>
  <ContextMenu.ContextMenu>
    <ContextMenu.ContextMenuTrigger as-child>
      <div
        :data-kanban-card="props.note.id"
        draggable="true"
        :class="
          cn(
            'bg-background border-border hover:border-primary/40 group cursor-pointer space-y-1.5 rounded-md border p-2.5 shadow-xs transition-colors select-none',
            priorityBorderClass,
            props.active && 'border-primary/60 bg-accent/40',
            isHighlighted && 'outline-primary outline-2 -outline-offset-2',
            props.dragging && 'opacity-50',
          )
        "
        @dragstart="emit('dragstart', props.note.id, $event)"
        @dragend="emit('dragend')"
        @contextmenu="onContextMenu"
        @click="emit('open', props.note.id)"
      >
        <div class="flex items-start gap-2">
          <div
            class="mt-0.5 flex shrink-0 items-center"
            @click.stop
          >
            <Checkbox
              :model-value="isDone"
              class="rounded-full"
              @update:model-value="emit('toggleComplete', props.note)"
            />
          </div>
          <UiText
            variant="sm"
            weight="medium"
            :class="
              cn(
                'line-clamp-2 min-w-0 flex-1 break-words',
                isDone && 'text-muted-foreground line-through',
              )
            "
          >
            {{ props.note.name || i18n.t('notes.untitled') }}
          </UiText>
          <Sun
            v-if="isInToday"
            class="mt-0.5 size-3.5 shrink-0 text-amber-500 dark:text-amber-400"
            :aria-label="i18n.t('notes.tasks.today')"
          />
          <Star
            v-if="props.note.isFavorites"
            class="mt-0.5 size-3.5 shrink-0 fill-current stroke-current text-amber-500 dark:text-amber-400"
            :aria-label="i18n.t('common.favorites')"
          />
        </div>

        <div
          v-if="priority || due || props.note.folder?.name"
          class="flex flex-wrap items-center gap-2 pl-6"
        >
          <div
            v-if="priority"
            class="flex items-center gap-1"
          >
            <Flag
              class="h-3 w-3 shrink-0 fill-current stroke-current"
              :class="getTaskPriorityFlagClass(priority)"
            />
            <UiText
              as="span"
              variant="xs"
              :class="getTaskPriorityFlagClass(priority)"
            >
              {{ priorityLabels[priority] }}
            </UiText>
          </div>

          <div
            v-if="due"
            class="flex items-center gap-1"
          >
            <CalendarIcon
              class="h-3 w-3 shrink-0"
              :class="isOverdue ? 'text-destructive' : 'text-muted-foreground'"
            />
            <UiText
              as="span"
              variant="xs"
              :muted="!isOverdue"
              :class="cn(isOverdue && 'text-destructive')"
            >
              {{ formattedDueDate }}
            </UiText>
          </div>

          <div
            v-if="props.note.folder?.name"
            class="flex min-w-0 items-center gap-1"
          >
            <Folder class="text-muted-foreground h-3 w-3 shrink-0" />
            <UiText
              as="span"
              variant="xs"
              muted
              class="max-w-28 truncate"
            >
              {{ props.note.folder.name }}
            </UiText>
          </div>
        </div>

        <div
          v-if="props.note.tags.length > 0"
          class="flex flex-wrap gap-1 pl-6"
        >
          <UiText
            v-for="tag in props.note.tags"
            :key="tag.id"
            as="span"
            variant="xs"
            muted
            class="bg-muted max-w-28 truncate rounded-full px-1.5 py-0.25"
          >
            #{{ tag.name }}
          </UiText>
        </div>
      </div>
    </ContextMenu.ContextMenuTrigger>
    <NotesListItemContextMenu :note="props.note" />
  </ContextMenu.ContextMenu>
</template>
