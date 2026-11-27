<script setup lang="ts">
import { useImportDialog, useNavigationHistory } from '@/composables'
import { i18n, store } from '@/electron'
import { router, RouterName } from '@/router'
import { LayoutGrid, Upload } from 'lucide-vue-next'
import NotesSidebarTasks from './NotesSidebarTasks.vue'

const { isNavigatingHistory, recordNavigation } = useNavigationHistory()
const { openImportDialog } = useImportDialog()

const libraryOpen = ref(
  store.app.get<boolean>('notes.layout.libraryOpen') ?? true,
)

const tasksOpen = ref(
  store.app.get<boolean>('notes.layout.tasksOpen') ?? true,
)

watch(libraryOpen, (value) => {
  store.app.set('notes.layout.libraryOpen', value)
})

watch(tasksOpen, (value) => {
  store.app.set('notes.layout.tasksOpen', value)
})

async function openDashboard() {
  if (router.currentRoute.value.name === RouterName.notesDashboard) {
    return
  }

  if (isNavigatingHistory.value) {
    await router.push({ name: RouterName.notesDashboard })
    return
  }

  await recordNavigation(async () => {
    await router.push({ name: RouterName.notesDashboard })
  })
}
</script>

<template>
  <div
    data-notes-sidebar
    class="scrollbar flex h-full flex-col overflow-x-hidden overflow-y-auto px-1"
    style="
      padding-top: calc(var(--content-top-offset) + var(--header-gap, 0px));
    "
  >
    <SidebarHeader
      v-model:section-open="libraryOpen"
      :title="i18n.t('notes.plural')"
      :section-title="i18n.t('notes.plural')"
      section-collapsible
    >
      <template #actions>
        <UiActionButton
          :tooltip="i18n.t('imports.action.import')"
          @click="openImportDialog('obsidian', 'notes')"
        >
          <Upload class="h-4 w-4" />
        </UiActionButton>
        <UiActionButton
          :tooltip="i18n.t('notes.dashboard.label')"
          @click="openDashboard"
        >
          <LayoutGrid class="h-4 w-4" />
        </UiActionButton>
      </template>
    </SidebarHeader>
    <NotesSidebarLibrary v-show="libraryOpen" />
    <SidebarSectionHeader
      v-model:open="tasksOpen"
      collapsible
      :title="i18n.t('notes.tasks.title')"
    />
    <NotesSidebarTasks v-show="tasksOpen" />
    <NotesSidebarFolders />
  </div>
</template>
