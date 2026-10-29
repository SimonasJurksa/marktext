import { ipcMain } from 'electron'
import { annotateFile, getCommitDetails, getRootStatus } from '../git'

export const registerGitHandlers = (): void => {
  ipcMain.handle('mt::git::annotate', (_e, filePath: string, contents: string, withStatus: boolean) =>
    annotateFile(filePath, contents, withStatus)
  )
  ipcMain.handle('mt::git::status', (_e, pathname: string) => getRootStatus(pathname))
  ipcMain.handle('mt::git::commit', (_e, root: string, sha: string) => getCommitDetails(root, sha))
}
