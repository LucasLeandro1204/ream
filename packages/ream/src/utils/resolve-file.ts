import path from 'path'
import { pathExists } from 'fs-extra'

export const resolveFile = async (files: string[], dir = '.') => {
  for (const file of files) {
    const absolutePath = path.resolve(dir, file)
    if (await pathExists(absolutePath)) {
      return absolutePath
    }
  }
}
