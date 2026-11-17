// Saving files fetched with the bearer token. Exports cannot be plain links, because a link
// cannot send the Authorization header, so the file is fetched first and saved from a blob.
import { useMutation } from '@tanstack/react-query'
import type { DownloadedFile } from '../api/client'

/** Hands a blob to the browser as a download */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Some browsers start the download after the click returns, so the URL is freed a little later
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface DownloadRequest {
  fetchFile: () => Promise<DownloadedFile>
  /** Used when the server does not send a file name, or the browser does not expose it */
  fallbackName: string
}

/** Fetches and saves a file; pending and error states come from the mutation */
export function useDownload() {
  return useMutation({
    mutationFn: async ({ fetchFile, fallbackName }: DownloadRequest) => {
      const { blob, filename } = await fetchFile()
      saveBlob(blob, filename ?? fallbackName)
    },
  })
}
