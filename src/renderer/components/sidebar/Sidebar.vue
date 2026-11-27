<script setup lang="ts">
import { useImportDialog } from '@/composables'
import { i18n, store } from '@/electron'
import { Upload } from 'lucide-vue-next'

const { openImportDialog } = useImportDialog()

const libraryOpen = ref(
  store.app.get<boolean>('code.layout.libraryOpen') ?? true,
)

watch(libraryOpen, (value) => {
  store.app.set('code.layout.libraryOpen', value)
})
</script>

<template>
  <div
    data-sidebar
    class="flex h-full flex-col px-1"
    style="
      padding-top: calc(var(--content-top-offset) + var(--header-gap, 0px));
    "
  >
    <SidebarHeader
      v-model:section-open="libraryOpen"
      :title="i18n.t('spaces.code.title')"
      :section-title="i18n.t('common.library')"
      section-collapsible
    >
      <template #actions>
        <UiActionButton
          :tooltip="i18n.t('imports.action.import')"
          @click="openImportDialog('vscode-snippets', 'code')"
        >
          <Upload class="h-4 w-4" />
        </UiActionButton>
      </template>
    </SidebarHeader>
    <SidebarLibrary :library-open="libraryOpen" />
  </div>
</template>
