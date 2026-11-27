<script setup lang="ts">
import { Button } from '@/components/ui/shadcn/button'
import * as Popover from '@/components/ui/shadcn/popover'
import {
  getLibraryFilterQuery,
  normalizeNotesSelectionState,
  useNoteFolders,
  useNotes,
  useNotesApp,
  useNoteSearch,
  useNoteTags,
} from '@/composables'
import { LibraryFilter } from '@/composables/types'
import { i18n } from '@/electron'
import { useDebounceFn } from '@vueuse/core'
import {
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDot,
  FileText,
  Kanban,
  ListTodo,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  {
    embedded: false,
  },
)

const {
  isSearch,
  createNoteAndSelect,
  createTaskAndSelect,
  emptyTrash,
} = useNotes()
const {
  searchQuery,
  clearSearch,
  search,
  searchSelectedIndex,
  selectSearchNote,
  displayedNotes,
} = useNoteSearch()
const {
  hideCompletedTasksInFolders,
  isFocusedSearch,
  notesState,
  isViewingTasks,
  isTasksKanbanView,
  toggleTasksKanbanView,
} = useNotesApp()
const { folders, getFolderByIdFromTree } = useNoteFolders()
const { tags } = useNoteTags()
const isCreateMenuOpen = ref(false)
const isSearchFilterMenuOpen = ref(false)

const searchFilterOptions = computed(() => [
  {
    token: 'due:<1day',
    label: i18n.t('notes.tasks.today'),
    icon: CalendarCheck,
    group: 'due',
  },
  {
    token: 'due:<5days',
    label: i18n.t('notes.tasks.upcoming'),
    icon: CalendarClock,
    group: 'due',
  },
  {
    token: 'status:todo',
    label: i18n.t('notes.tasks.status.todo'),
    icon: Circle,
    group: 'status',
  },
  {
    token: 'status:inProgress',
    label: i18n.t('notes.tasks.status.inProgress'),
    icon: CircleDot,
    group: 'status',
  },
  {
    token: 'status:blocked',
    label: i18n.t('notes.tasks.status.blocked'),
    icon: CircleAlert,
    group: 'status',
  },
  {
    token: 'status:done',
    label: i18n.t('notes.tasks.completed'),
    icon: CheckCircle2,
    group: 'status',
  },
])

function isSearchFilterTokenActive(token: string) {
  const words = searchQuery.value.trim().split(/\s+/).filter(Boolean)
  return words.some(word => word.toLowerCase() === token.toLowerCase())
}

function applySearchFilter(option: (typeof searchFilterOptions.value)[number]) {
  const words = searchQuery.value.trim().split(/\s+/).filter(Boolean)
  const prefix = `${option.group}:`
  const isAlreadyActive = words.some(
    word => word.toLowerCase() === option.token.toLowerCase(),
  )
  const filteredWords = words.filter(
    word => !word.toLowerCase().startsWith(prefix),
  )

  if (!isAlreadyActive) {
    filteredWords.unshift(option.token)
  }

  searchQuery.value = filteredWords.length
    ? `${filteredWords.join(' ')} `
    : ''
  isSearchFilterMenuOpen.value = false
  isFocusedSearch.value = true
}

async function onToggleTasksKanbanView() {
  toggleTasksKanbanView()
  if (hideCompletedTasksInFolders.value) {
    await normalizeNotesSelectionState()
  }
}

const isViewingTrash = computed(
  () =>
    !notesState.folderId
    && !notesState.tagId
    && (notesState.libraryFilter === LibraryFilter.Trash
      || notesState.libraryFilter === LibraryFilter.TasksTrash),
)

const libraryFilterLabels = computed<Record<string, string>>(() => ({
  [LibraryFilter.Inbox]: i18n.t('common.inbox'),
  [LibraryFilter.Favorites]: i18n.t('common.favorites'),
  [LibraryFilter.All]: i18n.t('spaces.notes.allNotes'),
  [LibraryFilter.TasksInbox]: i18n.t('common.inbox'),
  [LibraryFilter.TasksToday]: i18n.t('notes.tasks.today'),
  [LibraryFilter.TasksFavorites]: i18n.t('common.favorites'),
  [LibraryFilter.Tasks]: i18n.t('notes.tasks.title'),
  [LibraryFilter.TasksTrash]: i18n.t('common.trash'),
  [LibraryFilter.Today]: i18n.t('notes.tasks.today'),
  [LibraryFilter.Upcoming]: i18n.t('notes.tasks.upcoming'),
  [LibraryFilter.Todo]: i18n.t('notes.tasks.status.todo'),
  [LibraryFilter.InProgress]: i18n.t('notes.tasks.status.inProgress'),
  [LibraryFilter.Blocked]: i18n.t('notes.tasks.status.blocked'),
  [LibraryFilter.Completed]: i18n.t('notes.tasks.completed'),
  [LibraryFilter.Trash]: i18n.t('common.trash'),
}))

const isViewingFolderOrTag = computed(() =>
  Boolean(notesState.folderId || notesState.tagId),
)

const isTasksLibrarySelected = computed(
  () =>
    !isViewingFolderOrTag.value
    && getLibraryFilterQuery(notesState.libraryFilter).propertyType === 'task',
)

const createActionTooltip = computed(() =>
  isTasksLibrarySelected.value
    ? i18n.t('action.new.task')
    : i18n.t('action.new.note'),
)

const searchContextLabel = computed(() => {
  if (notesState.tagId) {
    const tag = tags.value.find(item => item.id === notesState.tagId)
    return tag ? `#${tag.name}` : undefined
  }

  if (notesState.folderId) {
    return getFolderByIdFromTree(folders.value, notesState.folderId)?.name
  }

  return notesState.libraryFilter
    ? libraryFilterLabels.value[notesState.libraryFilter]
    : undefined
})

const searchPlaceholder = computed(() =>
  searchContextLabel.value
    ? i18n.t('placeholder.searchIn', { context: searchContextLabel.value })
    : i18n.t('placeholder.searchNotes'),
)

async function onCreateDirectClick() {
  if (isTasksLibrarySelected.value) {
    await createTaskAndSelect()
    return
  }

  await createNoteAndSelect()
}

async function onCreateFromMenu(kind: 'note' | 'task') {
  isCreateMenuOpen.value = false
  if (kind === 'task') {
    await createTaskAndSelect()
    return
  }

  await createNoteAndSelect()
}

// Без debounce каждый символ порождает full-text запрос, смену выбранной
// заметки и перезагрузку документа в редакторе.
const searchDebounced = useDebounceFn(() => {
  if (searchQuery.value) {
    search()
  }
}, 200)

watch(searchQuery, (v) => {
  if (v) {
    searchDebounced()
  }
  else {
    clearSearch(true)
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    const nextIndex = Math.min(
      searchSelectedIndex.value + 1,
      (displayedNotes.value?.length || 0) - 1,
    )
    selectSearchNote(nextIndex)
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    const prevIndex = Math.max(searchSelectedIndex.value - 1, 0)
    selectSearchNote(prevIndex)
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    clearSearch(true)
  }
}
</script>

<template>
  <div
    :class="
      props.embedded
        ? 'min-w-0 flex-1'
        : 'border-border mt-[var(--content-top-offset)] mb-2 border-b pb-1'
    "
  >
    <div class="flex items-center px-1">
      <Popover.Popover
        v-if="isTasksLibrarySelected || isViewingFolderOrTag"
        v-model:open="isSearchFilterMenuOpen"
      >
        <Popover.PopoverTrigger as-child>
          <UiActionButton
            data-notes-search-filters
            :aria-label="i18n.t('placeholder.searchNotes')"
          >
            <Search class="h-4 w-4" />
          </UiActionButton>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          align="start"
          class="flex w-max max-w-(--reka-popover-content-available-width) min-w-[min(11rem,var(--reka-popover-content-available-width))] flex-col p-1"
        >
          <Button
            v-for="option in searchFilterOptions"
            :key="option.token"
            variant="ghost"
            size="sm"
            :data-search-filter-token="option.token"
            class="w-full min-w-0 justify-start"
            @click="applySearchFilter(option)"
          >
            <component
              :is="option.icon"
              class="h-4 w-4 shrink-0"
            />
            <UiText
              variant="base"
              weight="medium"
              class="min-w-0 truncate leading-5 text-inherit"
            >
              {{ option.label }}
            </UiText>
            <Check
              class="ml-auto h-4 w-4"
              :class="{ invisible: !isSearchFilterTokenActive(option.token) }"
            />
          </Button>
        </Popover.PopoverContent>
      </Popover.Popover>
      <Search
        v-else
        class="text-muted-foreground ml-1 h-4 w-4 shrink-0"
      />
      <div class="min-w-0 flex-grow">
        <UiInput
          v-model="searchQuery"
          :placeholder="searchPlaceholder"
          variant="ghost"
          class="truncate"
          :focus="isFocusedSearch"
          @blur="isFocusedSearch = false"
          @keydown="onKeydown"
        />
      </div>
      <UiActionButton
        v-if="searchQuery"
        :tooltip="i18n.t('action.clearSearch')"
        @click="clearSearch(true)"
      >
        <X class="h-4 w-4" />
      </UiActionButton>
      <UiActionButton
        v-if="isViewingTrash"
        data-notes-empty-trash
        :disabled="!displayedNotes?.length"
        :tooltip="i18n.t('action.delete.trash')"
        @click="emptyTrash"
      >
        <Trash2 class="h-4 w-4" />
      </UiActionButton>
      <UiActionButton
        v-if="isViewingTasks"
        data-tasks-kanban-toggle
        :active="isTasksKanbanView"
        :tooltip="
          i18n.t(
            isTasksKanbanView
              ? 'notes.tasks.listView'
              : 'notes.tasks.kanbanView',
          )
        "
        @click="onToggleTasksKanbanView"
      >
        <Kanban class="h-4 w-4" />
      </UiActionButton>
      <Popover.Popover
        v-if="!searchQuery && !isSearch && !isViewingTrash && isViewingFolderOrTag"
        v-model:open="isCreateMenuOpen"
      >
        <Popover.PopoverTrigger as-child>
          <UiActionButton
            data-notes-create-dropdown-trigger
            :aria-label="i18n.t('action.createOptions')"
          >
            <Plus class="h-4 w-4" />
          </UiActionButton>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent
          align="end"
          class="flex w-max max-w-(--reka-popover-content-available-width) min-w-[min(9rem,var(--reka-popover-content-available-width))] flex-col p-1"
        >
          <Button
            variant="ghost"
            size="sm"
            data-notes-create-option="note"
            class="w-full min-w-0 justify-start"
            @click="onCreateFromMenu('note')"
          >
            <FileText class="h-4 w-4" />
            <UiText
              variant="base"
              weight="medium"
              class="min-w-0 truncate leading-5 text-inherit"
            >
              {{ i18n.t("action.new.note") }}
            </UiText>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-notes-create-option="task"
            class="w-full min-w-0 justify-start"
            @click="onCreateFromMenu('task')"
          >
            <ListTodo class="h-4 w-4" />
            <UiText
              variant="base"
              weight="medium"
              class="min-w-0 truncate leading-5 text-inherit"
            >
              {{ i18n.t("action.new.task") }}
            </UiText>
          </Button>
        </Popover.PopoverContent>
      </Popover.Popover>
      <UiActionButton
        v-else-if="!searchQuery && !isSearch && !isViewingTrash"
        data-notes-create-direct
        :tooltip="createActionTooltip"
        :shortcut="
          isTasksLibrarySelected
            ? 'CommandOrControl+T'
            : 'CommandOrControl+N'
        "
        @click="onCreateDirectClick"
      >
        <Plus class="h-4 w-4" />
      </UiActionButton>
    </div>
  </div>
</template>
