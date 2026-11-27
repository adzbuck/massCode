import type { NoteTaskPriorityValue } from '@/composables'
import { NoteTaskPriority } from '@/composables'

export function getTaskPriorityFlagClass(
  priority: NoteTaskPriorityValue | '' | undefined,
) {
  if (priority === NoteTaskPriority.High) {
    return 'text-destructive'
  }

  if (priority === NoteTaskPriority.Medium) {
    return 'text-amber-500 dark:text-amber-400'
  }

  if (priority === NoteTaskPriority.Low) {
    return 'text-sky-500 dark:text-sky-400'
  }

  return 'text-muted-foreground'
}

export function getTaskPriorityBorderClass(
  priority: NoteTaskPriorityValue | '' | undefined,
) {
  if (priority === NoteTaskPriority.High) {
    return 'border-r-[3px] border-r-destructive!'
  }

  if (priority === NoteTaskPriority.Medium) {
    return 'border-r-[3px] border-r-amber-500! dark:border-r-amber-400!'
  }

  if (priority === NoteTaskPriority.Low) {
    return 'border-r-[3px] border-r-sky-500! dark:border-r-sky-400!'
  }

  return ''
}
