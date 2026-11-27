<script setup lang="ts">
import type { TreeNode as TreeNodeType } from '@/components/ui/tree/types'
import * as ContextMenu from '@/components/ui/shadcn/context-menu'
import { Tree as UiTree } from '@/components/ui/tree'
import {
  useDeleteShortcut,
  useDialog,
  useNoteFolders,
  useNotes,
  useNotesApp,
  useNoteSearch,
  useNoteTags,
} from '@/composables'
import { i18n } from '@/electron'
import { router, RouterName } from '@/router'
import { Tag } from 'lucide-vue-next'
import { useRoute } from 'vue-router'

const { tags, getNoteTags, updateNoteTag, deleteNoteTag } = useNoteTags()
const {
  highlightedFolderIds,
  highlightedNoteIds,
  highlightedTagId,
  notesState,
} = useNotesApp()
const {
  getNotes,
  selectFirstNote,
  clearNotes,
  withNotesLoading,
  isRestoreStateBlocked,
} = useNotes()
const { clearSearch } = useNoteSearch()
const { clearFolderSelection } = useNoteFolders()
const route = useRoute()

onMounted(() => {
  if (!tags.value.length) {
    void getNoteTags()
  }
})

const idToDelete = ref(0)
const editableId = ref<string | number | null>(null)
const focusedId = ref<string | number | undefined>()

const treeData = computed<TreeNodeType[]>(() =>
  tags.value.map(tag => ({
    id: tag.id,
    label: tag.name,
  })),
)

const selectedIds = computed<(string | number)[]>({
  get: () =>
    route.name === RouterName.notesSpace && notesState.tagId !== undefined
      ? [notesState.tagId]
      : [],
  set: () => {},
})

const highlightedIds = computed({
  get: () =>
    highlightedTagId.value !== undefined
      ? new Set<string | number>([highlightedTagId.value])
      : new Set<string | number>(),
  set: (val) => {
    const first = val.values().next().value
    highlightedTagId.value = first !== undefined ? Number(first) : undefined
  },
})

async function onClickNode({ node }: { node: TreeNodeType }) {
  const tagId = Number(node.id)
  highlightedFolderIds.value.clear()
  highlightedTagId.value = undefined

  if (route.name !== RouterName.notesSpace) {
    await router.push({ name: RouterName.notesSpace })
  }

  await withNotesLoading(async () => {
    notesState.tagId = tagId
    clearFolderSelection()
    notesState.libraryFilter = undefined

    isRestoreStateBlocked.value = true
    clearSearch()

    await getNotes({ tagId })
    selectFirstNote()
  })
}

function onDblclickNode(node: TreeNodeType) {
  setTimeout(() => {
    editableId.value = node.id
  }, 100)
}

function onContextMenu({ node }: { node: TreeNodeType }) {
  const tagId = Number(node.id)
  highlightedTagId.value = tagId
  idToDelete.value = tagId
  highlightedNoteIds.value.clear()
}

function onRename() {
  setTimeout(() => {
    if (!idToDelete.value)
      return
    editableId.value = idToDelete.value
  }, 100)
}

async function onUpdateLabel({
  node,
  value,
}: {
  node: TreeNodeType
  value: string
}) {
  const trimmed = value.trim()
  editableId.value = null
  if (!trimmed) {
    return
  }

  await updateNoteTag(Number(node.id), trimmed)

  if (notesState.tagId === Number(node.id)) {
    await getNotes({ tagId: notesState.tagId })
  }
}

function onCancelEdit() {
  editableId.value = null
}

async function onDelete(targetId = idToDelete.value) {
  if (!targetId) {
    return
  }

  const { confirm } = useDialog()

  const name = tags.value.find(tag => tag.id === targetId)?.name

  const isConfirmed = await confirm({
    title: i18n.t('messages:confirm.delete', { name }),
    content: i18n.t('messages:warning.deleteTag'),
  })

  if (isConfirmed) {
    await deleteNoteTag(targetId)

    if (notesState.tagId === targetId) {
      notesState.tagId = undefined
      clearNotes()
    }
    else if (notesState.tagId) {
      await getNotes({ tagId: notesState.tagId })
    }

    idToDelete.value = 0
  }
}

function onUpdateContextMenu(isOpen: boolean) {
  if (!isOpen) {
    highlightedTagId.value = undefined
  }
}

useDeleteShortcut({
  rootSelector: '[data-notes-sidebar-tags]',
  isEnabled: () => focusedId.value !== undefined,
  onDelete: () => {
    if (focusedId.value !== undefined) {
      void onDelete(Number(focusedId.value))
    }
  },
})
</script>

<template>
  <div
    data-notes-sidebar-tags
    class="shrink-0"
  >
    <ContextMenu.ContextMenu
      v-if="treeData.length"
      @update:open="onUpdateContextMenu"
    >
      <ContextMenu.ContextMenuTrigger as-child>
        <UiTree
          :active-id="selectedIds.length === 1 ? selectedIds[0] : undefined"
          :model-value="treeData"
          :selected-ids="selectedIds"
          :editable-id="editableId"
          :focused-id="focusedId"
          :highlighted-ids="highlightedIds"
          :can-drag="() => false"
          :can-drop="() => false"
          class="px-0.5 pb-1"
          @click-node="onClickNode"
          @dblclick-node="onDblclickNode"
          @context-menu="onContextMenu"
          @update-label="onUpdateLabel"
          @cancel-edit="onCancelEdit"
          @update:selected-ids="selectedIds = $event"
          @update:editable-id="editableId = $event"
          @update:focused-id="focusedId = $event"
          @update:highlighted-ids="highlightedIds = $event"
        >
          <template #icon>
            <div class="mr-1.5 flex flex-shrink-0 items-center">
              <Tag class="h-4 w-4" />
            </div>
          </template>
        </UiTree>
      </ContextMenu.ContextMenuTrigger>
      <ContextMenu.ContextMenuContent>
        <ContextMenu.ContextMenuItem @click="onRename">
          {{ i18n.t("action.rename") }}
        </ContextMenu.ContextMenuItem>
        <ContextMenu.ContextMenuItem @click="onDelete()">
          {{ i18n.t("action.delete.common") }}
        </ContextMenu.ContextMenuItem>
      </ContextMenu.ContextMenuContent>
    </ContextMenu.ContextMenu>
    <UiEmptyPlaceholder
      v-else
      :text="i18n.t('placeholder.emptyNotesTagList')"
    />
  </div>
</template>
