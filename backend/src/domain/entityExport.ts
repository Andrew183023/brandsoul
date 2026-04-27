export type EntityExportRecord = {
  id: string
  entityId: string
  format: string
  createdAt: string
  metadata: Record<string, unknown>
  fileUrl?: string
}