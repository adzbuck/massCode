<script setup lang="ts">
interface Props {
  title: string
  sectionTitle?: string
  sectionCollapsible?: boolean
  sectionOpen?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'update:sectionOpen': [value: boolean] }>()

const open = computed({
  get: () => props.sectionOpen,
  set: value => emit('update:sectionOpen', Boolean(value)),
})
</script>

<template>
  <div>
    <div class="flex h-7 items-center justify-between pl-1 select-none">
      <div class="truncate leading-5 font-bold">
        {{ title }}
      </div>
      <div
        v-if="$slots.actions"
        class="flex items-center gap-1"
      >
        <slot name="actions" />
      </div>
    </div>
    <SidebarSectionHeader
      v-if="sectionTitle"
      v-model:open="open"
      :title="sectionTitle"
      :collapsible="sectionCollapsible"
    >
      <template
        v-if="$slots.action"
        #action
      >
        <slot name="action" />
      </template>
    </SidebarSectionHeader>
  </div>
</template>
