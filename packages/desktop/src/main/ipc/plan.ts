import { ipcMain } from 'electron'
import { getPlanStatus } from '../plan'

export const registerPlanHandlers = (): void => {
  ipcMain.handle('mt::plan::status', (_e, pathnames: string[]) => getPlanStatus(pathnames))
}
