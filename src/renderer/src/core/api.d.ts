import type { XcodeApi } from '../../../preload/index'

declare global {
  interface Window {
    xcode: XcodeApi
  }
}

export {}
