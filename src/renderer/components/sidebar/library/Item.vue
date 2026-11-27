<script setup lang="ts">
import type { SnippetsQuery } from '~/renderer/services/api/generated'
import { useApp, useFolders, useSnippets } from '@/composables'
import { LibraryFilter } from '@/composables/types'
import { i18n } from '@/electron'
import { onClickOutside } from '@vueuse/core'
import { Trash2 } from 'lucide-vue-next'

const props = defineProps<Props>()

interface Props {
  id: (typeof LibraryFilter)[keyof typeof LibraryFilter]
  name: string
  icon: Component
}

const { state } = useApp()
const { clearFolderSelection } = useFolders()

const {
  getSnippets,
  selectFirstSnippet,
  clearSearch,
  emptyTrash,
  isRestoreStateBlocked,
} = useSnippets()

const isFocused = ref(false)
const itemRef = ref<HTMLElement>()
const isSelected = computed(() => state.libraryFilter === props.id)

async function onItemClick(
  id: (typeof LibraryFilter)[keyof typeof LibraryFilter],
) {
  isFocused.value = true
  isRestoreStateBlocked.value = true
  clearSearch()

  state.libraryFilter = id
  clearFolderSelection()
  state.tagId = undefined

  const query: SnippetsQuery = {}

  if (id === LibraryFilter.Favorites) {
    query.isFavorites = 1
  }
  else if (id === LibraryFilter.Trash) {
    query.isDeleted = 1
  }
  else if (id === LibraryFilter.All) {
    query.isDeleted = 0
  }
  else if (id === LibraryFilter.Inbox) {
    query.isInbox = 1
  }

  await getSnippets(query)
  selectFirstSnippet()
}

onClickOutside(itemRef, () => {
  isFocused.value = false
})
</script>

<template>
  <div
    ref="itemRef"
    data-sidebar-item
    :data-selected="isSelected ? 'true' : undefined"
    :data-focused="isFocused ? 'true' : undefined"
    class="group data-[selected=true]:bg-accent data-[focused=true]:bg-primary! data-[focused=true]:text-primary-foreground rounded-md"
    :class="{ 'hover:bg-accent-hover': !isSelected && !isFocused }"
    @click="onItemClick(id)"
  >
    <div class="ml-5.5 flex items-center">
      <component
        :is="icon"
        class="mr-0.5 h-4 w-4 shrink-0"
      />
      <div class="ml-1 min-w-0 flex-1 truncate select-none">
        {{ name }}
      </div>
      <UiActionButton
        v-if="id === LibraryFilter.Trash"
        data-snippets-sidebar-empty-trash
        :tooltip="i18n.t('action.delete.trash')"
        class="mr-0.5 h-5 w-5 opacity-0 group-hover:opacity-100 group-data-[selected=true]:opacity-100 group-data-[focused=true]:text-inherit group-data-[focused=true]:opacity-100 [&_svg:not([class*='size-'])]:size-3.5"
        @click.stop="emptyTrash"
      >
        <Trash2 class="size-3.5" />
      </UiActionButton>
    </div>
  </div>
</template>
