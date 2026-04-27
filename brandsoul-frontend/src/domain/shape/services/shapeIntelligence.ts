import type { ExtractedShapeSource } from '../contracts/ProcessedShape'
import { abstractShape } from '../transformation/abstractShape'
import { extractRasterShape } from '../extraction/rasterShapeExtractor'
import { extractSvgShape } from '../extraction/svgShapeExtractor'
import { detectSupportedLogoFileFormat, isSvgImageSource } from '../../../lib/media'

export { abstractShape }

export async function extractShapeSource({
  file,
  imageSource,
}: {
  file?: File
  imageSource: string
}): Promise<ExtractedShapeSource | undefined> {
  const isSvg = detectSupportedLogoFileFormat(file) === 'svg' || isSvgImageSource(imageSource)

  if (isSvg) {
    const svgShape = await extractSvgShape(imageSource)
    if (svgShape) {
      return svgShape
    }
  }

  return extractRasterShape(imageSource)
}
