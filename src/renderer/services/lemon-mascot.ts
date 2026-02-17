import { generateImage } from './lemonade'
import { IMAGE_MODEL } from '../../shared/constants'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Lemon mascot expression types
 */
export type LemonExpression = 'neutral' | 'yes' | 'no' | 'probably' | 'probably_not' | 'dont_know'

/**
 * Mapping of expressions to emotion descriptions for prompts
 */
const EXPRESSION_PROMPTS: Record<LemonExpression, string> = {
  neutral: 'friendly smiling face, welcoming expression, cheerful and inviting',
  yes: 'very happy excited face, big smile, enthusiastic and joyful expression',
  no: 'sad disappointed face, frowning, dejected expression',
  probably: 'thoughtful considering face, slight smile, pondering expression with hand on chin',
  probably_not: 'skeptical uncertain face, raised eyebrow, doubtful expression',
  dont_know: 'confused puzzled face, question mark expression, bewildered look',
}

const BASE_PROMPT = `3D rendered anthropomorphic glass of lemonade character, Kool-Aid Man style, cute mascot design, 
glass pitcher filled with yellow lemonade, visible ice cubes floating inside, lemon slice garnish on rim, 
condensation droplets on glass surface, cartoon arms and legs with white gloves and shoes, 
professional 3D render, Pixar style, high quality CGI, clean background, studio lighting, vibrant colors`

const NEGATIVE_PROMPT = 'blurry, low quality, deformed, disfigured, realistic human, photograph, dark, gloomy, text, watermark, logo, multiple characters'

const LEMON_ASSETS_DIR = path.join(process.cwd(), 'public', 'lemon-assets')

/**
 * Ensure the lemon assets directory exists
 */
function ensureAssetsDirectory() {
  if (!fs.existsSync(LEMON_ASSETS_DIR)) {
    fs.mkdirSync(LEMON_ASSETS_DIR, { recursive: true })
    console.info('[Lemon] Created assets directory:', LEMON_ASSETS_DIR)
  }
}

/**
 * Get file path for a cached lemon expression
 */
function getCachedImagePath(expression: LemonExpression): string {
  return path.join(LEMON_ASSETS_DIR, `lemon-${expression}.png`)
}

/**
 * Check if a lemon expression image is already cached
 */
export function isExpressionCached(expression: LemonExpression): boolean {
  return fs.existsSync(getCachedImagePath(expression))
}

/**
 * Check if all lemon expressions are cached
 */
export function areAllExpressionsCached(): boolean {
  const expressions: LemonExpression[] = ['neutral', 'yes', 'no', 'probably', 'probably_not', 'dont_know']
  return expressions.every(isExpressionCached)
}

/**
 * Generate a single lemon expression image
 */
async function generateLemonExpression(expression: LemonExpression, seed: number): Promise<string> {
  console.info(`[Lemon] Generating ${expression} expression...`)
  
  const emotionPrompt = EXPRESSION_PROMPTS[expression]
  const fullPrompt = `${BASE_PROMPT}, ${emotionPrompt}`
  
  try {
    const response = await generateImage({
      model: IMAGE_MODEL,
      prompt: fullPrompt,
      negative_prompt: NEGATIVE_PROMPT,
      seed: seed + expression.length, // Vary seed slightly per expression
      steps: 6, // Slightly more steps for better quality since these are cached
      cfg_scale: 1.5,
      width: 512,
      height: 512,
    })
    
    const base64 = response.data?.[0]?.b64_json
    if (!base64) throw new Error(`No image returned for ${expression}`)
    
    console.info(`[Lemon] ✓ Generated ${expression} expression`)
    return base64
  } catch (error) {
    console.error(`[Lemon] Failed to generate ${expression}:`, error)
    throw error
  }
}

/**
 * Save base64 image to disk
 */
function saveImageToDisk(base64Data: string, filePath: string) {
  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)
  console.info(`[Lemon] Saved to disk: ${filePath}`)
}

/**
 * Generate and cache a single lemon expression
 */
export async function generateAndCacheExpression(expression: LemonExpression, seed: number = 42): Promise<void> {
  ensureAssetsDirectory()
  
  if (isExpressionCached(expression)) {
    console.info(`[Lemon] ${expression} already cached, skipping generation`)
    return
  }
  
  const base64 = await generateLemonExpression(expression, seed)
  const filePath = getCachedImagePath(expression)
  saveImageToDisk(base64, filePath)
  
  console.info(`[Lemon] ✓ Cached ${expression} expression`)
}

/**
 * Generate and cache all lemon expressions
 */
export async function generateAllLemonExpressions(seed: number = 42): Promise<void> {
  console.info('[Lemon] ==========================================')
  console.info('[Lemon] Generating Lemon mascot expressions')
  console.info('[Lemon] ==========================================')
  
  ensureAssetsDirectory()
  
  const expressions: LemonExpression[] = ['neutral', 'yes', 'no', 'probably', 'probably_not', 'dont_know']
  const uncached = expressions.filter(expr => !isExpressionCached(expr))
  
  if (uncached.length === 0) {
    console.info('[Lemon] All expressions already cached!')
    return
  }
  
  console.info(`[Lemon] Need to generate ${uncached.length} expressions: ${uncached.join(', ')}`)
  
  for (const expression of uncached) {
    try {
      await generateAndCacheExpression(expression, seed)
    } catch (error) {
      console.error(`[Lemon] Failed to generate ${expression}, continuing with others...`)
    }
  }
  
  console.info('[Lemon] ==========================================')
  console.info('[Lemon] Lemon mascot generation complete!')
  console.info('[Lemon] ==========================================')
}

/**
 * Get public URL for a lemon expression image
 */
export function getLemonImageUrl(expression: LemonExpression): string {
  return `/lemon-assets/lemon-${expression}.png`
}

/**
 * Load a cached lemon expression as base64 data URL
 */
export function loadCachedExpression(expression: LemonExpression): string | null {
  const filePath = getCachedImagePath(expression)
  
  if (!fs.existsSync(filePath)) {
    return null
  }
  
  try {
    const buffer = fs.readFileSync(filePath)
    const base64 = buffer.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch (error) {
    console.error(`[Lemon] Failed to load cached ${expression}:`, error)
    return null
  }
}
