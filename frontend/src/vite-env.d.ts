/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_ORIGIN: string
  readonly VITE_DATA_SOURCE?: 'mock' | 'http'
}
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
