<script setup lang="ts">
import * as ContextMenu from '@/components/ui/shadcn/context-menu'
import { useNotes, useNotesApp } from '@/composables'
import { useNotesWorkspaceNavigation } from '@/composables/spaces/notes/useNotesWorkspaceNavigation'
import { LibraryFilter } from '@/composables/types'
import { i18n } from '@/electron'
import { RouterName } from '@/router'
import { onClickOutside } from '@vueuse/core'
import {
  Inbox,
  ListTodo,
  Star,
  Trash,
  Trash2,
} from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const { notesCreateKind, notesState } = useNotesApp()
const { cleanupCompletedTasks, emptyTrash, selectFirstNote, updateNotes }
  = useNotes()
const { openNotesLibrary } = useNotesWorkspaceNavigation()
const route = useRoute()

const taskItems = [
  {
    id: LibraryFilter.TasksInbox,
    name: i18n.t('common.inbox'),
    icon: Inbox,
  },
  {
    id: LibraryFilter.TasksFavorites,
    name: i18n.t('common.favorites'),
    icon: Star,
  },
  {
    id: LibraryFilter.Tasks,
    name: i18n.t('notes.tasks.title'),
    icon: ListTodo,
  },
  {
    id: LibraryFilter.TasksTrash,
    name: i18n.t('common.trash'),
    icon: Trash,
  },
]

const focusedItemId = ref<string>()
const dragOverItemId = ref<string>()
const itemRef = ref<HTMLElement>()

function isDroppableItem(id: string) {
  return (
    id === LibraryFilter.TasksInbox
    || id === LibraryFilter.TasksFavorites
    || id === LibraryFilter.TasksTrash
  )
}

function parseDroppedNoteIds(dataTransfer: DataTransfer | null): number[] {
  if (!dataTransfer) {
    return []
  }

  try {
    const parsed = JSON.parse(dataTransfer.getData('noteIds') || '[]')
    if (Array.isArray(parsed)) {
      return parsed
        .map(id => Number(id))
        .filter(id => Number.isFinite(id))
    }
  }
  catch {
    // ignore malformed drag payload
  }

  const plainId = Number(dataTransfer.getData('text/plain'))
  return Number.isFinite(plainId) && plainId > 0 ? [plainId] : []
}

function onDragOver(item: (typeof taskItems)[number], event: DragEvent) {
  if (!isDroppableItem(item.id)) {
    return
  }

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  dragOverItemId.value = item.id
}

function onDragLeave(item: (typeof taskItems)[number], event: DragEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const relatedTarget = event.relatedTarget as Node | null
  if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
    return
  }
  if (dragOverItemId.value === item.id) {
    dragOverItemId.value = undefined
  }
}

async function onDrop(item: (typeof taskItems)[number], event: DragEvent) {
  dragOverItemId.value = undefined
  if (!isDroppableItem(item.id)) {
    return
  }

  event.preventDefault()
  const noteIds = parseDroppedNoteIds(event.dataTransfer)
  if (!noteIds.length) {
    return
  }

  if (item.id === LibraryFilter.TasksInbox) {
    await updateNotes(
      noteIds,
      noteIds.map(() => ({ folderId: null, isDeleted: 0 })),
    )
    selectFirstNote()
    return
  }

  if (item.id === LibraryFilter.TasksFavorites) {
    await updateNotes(
      noteIds,
      noteIds.map(() => ({ isFavorites: 1, isDeleted: 0 })),
    )
    selectFirstNote()
    return
  }

  if (item.id === LibraryFilter.TasksTrash) {
    await updateNotes(
      noteIds,
      noteIds.map(() => ({ folderId: null, isDeleted: 1 })),
    )
    selectFirstNote()
  }
}

function isItemSelected(item: (typeof taskItems)[number]) {
  return (
    route.name === RouterName.notesSpace && notesState.libraryFilter === item.id
  )
}

async function onItemClick(item: (typeof taskItems)[number]) {
  focusedItemId.value = item.id
  notesCreateKind.value = 'task'
  await openNotesLibrary(item.id)
}

onClickOutside(itemRef, () => {
  focusedItemId.value = undefined
})
</script>

<template>
  <div
    ref="itemRef"
    class="shrink-0 overflow-hidden"
    data-notes-sidebar-tasks
  >
    <ContextMenu.ContextMenu>
      <ContextMenu.ContextMenuTrigger>
        <div class="px-1">
          <div
            v-for="item in taskItems"
            :key="item.id"
            data-sidebar-item
            :data-selected="isItemSelected(item) ? 'true' : undefined"
            :data-focused="focusedItemId === item.id ? 'true' : undefined"
            class="group data-[selected=true]:bg-accent data-[focused=true]:bg-primary! data-[focused=true]:text-primary-foreground rounded-md"
            :class="{
              'hover:bg-accent-hover':
                !isItemSelected(item) && focusedItemId !== item.id,
              'outline-primary outline-2 -outline-offset-2':
                dragOverItemId === item.id,
            }"
            @click="onItemClick(item)"
            @dragover="onDragOver(item, $event)"
            @dragleave="onDragLeave(item, $event)"
            @drop="onDrop(item, $event)"
          >
            <div class="ml-5.5 flex items-center">
              <component
                :is="item.icon"
                class="mr-0.5 h-4 w-4 shrink-0"
              />
              <div class="ml-1 min-w-0 flex-1 truncate select-none">
                {{ item.name }}
              </div>
              <UiActionButton
                v-if="item.id === LibraryFilter.TasksTrash"
                data-tasks-sidebar-empty-trash
                :tooltip="i18n.t('action.delete.trash')"
                class="mr-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 group-data-[focused=true]:text-inherit group-data-[focused=true]:opacity-100 [&_svg:not([class*='size-'])]:size-3.5"
                @click.stop="emptyTrash({ propertyType: 'task' })"
              >
                <Trash2 class="size-3.5" />
              </UiActionButton>
            </div>
          </div>
        </div>
      </ContextMenu.ContextMenuTrigger>
      <ContextMenu.ContextMenuContent>
        <ContextMenu.ContextMenuItem @click="cleanupCompletedTasks()">
          {{ i18n.t("notes.tasks.cleanupCompleted") }}
        </ContextMenu.ContextMenuItem>
        <ContextMenu.ContextMenuItem @click="emptyTrash({ propertyType: 'task' })">
          {{ i18n.t("action.delete.trash") }}
        </ContextMenu.ContextMenuItem>
      </ContextMenu.ContextMenuContent>
    </ContextMenu.ContextMenu>
  </div>
</template>
