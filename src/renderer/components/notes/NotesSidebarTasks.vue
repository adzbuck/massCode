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
const { cleanupCompletedTasks, emptyTrash } = useNotes()
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
const itemRef = ref<HTMLElement>()

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
            }"
            @click="onItemClick(item)"
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
