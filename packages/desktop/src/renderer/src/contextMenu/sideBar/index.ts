import {
  SEPARATOR,
  getNewFile,
  getNewDirectory,
  getCOPY,
  getCUT,
  getPASTE,
  getRENAME,
  getDELETE,
  getCopyPath,
  getShowInFolder
} from './menuItems'
import { t } from '../../i18n'
import { popupContextMenu, type ContextMenuItem } from '../popupMenu'

/** State and action behind the "Show empty folders" checkbox; the tree passes its store's. */
export interface EmptyFoldersToggle {
  shown: boolean
  toggle: () => void
}

const getShowEmptyFolders = (emptyFolders: EmptyFoldersToggle): ContextMenuItem => ({
  label: t('sideBar.tree.showEmptyFolders'),
  type: 'checkbox',
  checked: emptyFolders.shown,
  click: emptyFolders.toggle
})

export const showContextMenu = (
  event: { clientX: number; clientY: number },
  hasPathCache: boolean,
  emptyFolders?: EmptyFoldersToggle
): void => {
  const contextItems: ContextMenuItem[] = [
    getNewFile(),
    getNewDirectory(),
    SEPARATOR,
    getCOPY(),
    getCUT(),
    getPASTE(),
    SEPARATOR,
    getRENAME(),
    getDELETE(),
    SEPARATOR,
    getCopyPath(),
    getShowInFolder()
  ]
  if (emptyFolders) contextItems.push(SEPARATOR, getShowEmptyFolders(emptyFolders))

  contextItems[5].enabled = hasPathCache

  const items: ContextMenuItem[] = contextItems.map((item) => {
    if (!item || item.type === 'separator') return item
    const click = item.click
    return {
      ...item,
      click: click ? () => click(null, null) : undefined
    }
  })

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}

export const showRootContextMenu = (
  event: { clientX: number; clientY: number },
  hasClipboard: boolean,
  ready: boolean,
  remove: () => void,
  retry: () => void,
  emptyFolders?: EmptyFoldersToggle
): void => {
  const paste = getPASTE()
  const items: ContextMenuItem[] = ready
    ? [getNewFile(), getNewDirectory(), { ...paste, enabled: hasClipboard }, SEPARATOR]
    : [{ label: t('sideBar.tree.retryFolder'), click: retry }, SEPARATOR]
  items.push(getCopyPath(), getShowInFolder(), SEPARATOR, { label: t('sideBar.tree.removeFolder'), click: remove })
  if (emptyFolders) items.push(SEPARATOR, getShowEmptyFolders(emptyFolders))
  popupContextMenu(items.map(item => {
    if (!item || item.type === 'separator') return item
    const click = item.click
    return { ...item, click: click ? () => click(null, null) : undefined }
  }), { x: event.clientX, y: event.clientY })
}
