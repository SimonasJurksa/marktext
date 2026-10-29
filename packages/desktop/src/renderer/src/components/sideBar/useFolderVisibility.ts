import { computed, type ComputedRef } from 'vue'
import { useProjectStore } from '@/store/project'
import type { FolderVisibility } from './emptyFolders'
import type { TreeFolderNode } from './types'

/** Which empty folders the tree still lists; see `visibleFolders`. */
export const useFolderVisibility = (): ComputedRef<FolderVisibility> => {
  const projectStore = useProjectStore()
  return computed(() => {
    const showEmpty = projectStore.showEmptyFolders
    const pinned = projectStore.pinnedFolders
    const renaming = projectStore.renameCache
    const creatingIn = (projectStore.createCache as { dirname?: string }).dirname
    return {
      showEmpty,
      keep: (folder: TreeFolderNode) =>
        pinned.has(folder.pathname) || renaming === folder.pathname || creatingIn === folder.pathname
    }
  })
}
