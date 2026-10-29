import type { TreeFolderNode } from './types'

/** True when the folder, or any folder below it, holds a file the tree lists. */
export const holdsFiles = (folder: TreeFolderNode): boolean =>
  folder.files.length > 0 || folder.folders.some(holdsFiles)

export interface FolderVisibility {
  showEmpty: boolean
  /** Empty folders that must stay listed anyway: created this session, being renamed, receiving a new file. */
  keep: (folder: TreeFolderNode) => boolean
}

const listed = (folder: TreeFolderNode, keep: FolderVisibility['keep']): boolean =>
  folder.files.length > 0 || keep(folder) || folder.folders.some((child) => listed(child, keep))

export const visibleFolders = (
  folders: TreeFolderNode[],
  visibility: FolderVisibility
): TreeFolderNode[] =>
  visibility.showEmpty ? folders : folders.filter((folder) => listed(folder, visibility.keep))
