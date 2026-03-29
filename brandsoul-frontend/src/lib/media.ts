export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Não consegui ler este arquivo.'))
    reader.readAsDataURL(file)
  })
}

export async function readFilesAsDataUrls(files: FileList | File[], limit?: number) {
  const resolvedFiles = Array.from(files).slice(0, limit)
  const dataUrls = await Promise.all(resolvedFiles.map((file) => readFileAsDataUrl(file)))
  return dataUrls.filter(Boolean)
}
