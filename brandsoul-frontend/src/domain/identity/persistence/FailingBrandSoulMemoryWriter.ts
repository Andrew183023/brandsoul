import type { BrandSoulMemoryWriteRequest, BrandSoulMemoryWriteResult, BrandSoulMemoryWriter } from './BrandSoulMemoryWriter'

export type FailingBrandSoulMemoryWriterOptions = {
  errorMessage?: string
}

export class FailingBrandSoulMemoryWriter implements BrandSoulMemoryWriter {
  private readonly errorMessage: string

  constructor(options?: FailingBrandSoulMemoryWriterOptions) {
    this.errorMessage = options?.errorMessage ?? 'Simulated BrandSoul memory persistence failure'
  }

  async write(_request: BrandSoulMemoryWriteRequest): Promise<BrandSoulMemoryWriteResult> {
    throw new Error(this.errorMessage)
  }
}