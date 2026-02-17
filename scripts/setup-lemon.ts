/**
 * Setup script to generate Lemon mascot expressions
 * Run this once to pre-generate all lemon character images
 * 
 * Usage: npm run setup:lemon
 */

import { generateImage } from '../src/renderer/services/lemonade'
import { IMAGE_MODEL } from '../src/shared/constants'
import * as fs from 'fs'
import * as path from 'path'

type LemonExpression = 'neutral' | 'yes' | 'no' | 'probably' | 'probably_not' | 'dont_know'

type ExpressionPrompt = {
  positive: string
  negative: string
}

const EXPRESSION_PROMPTS: Record<LemonExpression, ExpressionPrompt> = {
  neutral: {
    positive: 'calm neutral expression, gentle smile, friendly welcoming face, relaxed demeanor',
    negative: 'frowning, sad, angry, extreme emotions',
  },
  yes: {
    positive: 'VERY HAPPY, EXCITED, ENTHUSIASTIC, HUGE WIDE SMILE, JOYFUL, CELEBRATING, eyes wide open with excitement, mouth open in big grin',
    negative: 'sad, frowning, crying, disappointed, neutral, calm',
  },
  no: {
    positive: 'VERY SAD, DISAPPOINTED, CRYING, FROWNING DEEPLY, mouth turned down, tears, dejected, depressed expression, downcast eyes, UNHAPPY',
    negative: 'smiling, happy, grinning, cheerful, laughing, positive',
  },
  probably: {
    positive: 'THOUGHTFUL, PONDERING, considering carefully, hand on chin, slight optimistic smile, analytical expression, thinking pose',
    negative: 'laughing, big smile, sad, crying, confused',
  },
  probably_not: {
    positive: 'SKEPTICAL, DOUBTFUL, UNCERTAIN, one eyebrow raised, suspicious look, questioning expression, arms crossed, NOT convinced, dubious',
    negative: 'smiling broadly, happy, enthusiastic, sad, crying',
  },
  dont_know: {
    positive: 'VERY CONFUSED, BEWILDERED, PUZZLED, scratching head, question marks around head, lost expression, eyes looking different directions, shrugging shoulders, COMPLETELY UNSURE',
    negative: 'smiling, happy, confident, certain, sad',
  },
}

const BASE_PROMPT = `high quality 3D rendered anthropomorphic glass of lemonade character, Kool-Aid Man mascot style, cute cartoon design, 
transparent glass pitcher filled with bright yellow lemonade liquid, ice cubes floating inside visible through glass, 
fresh lemon slice garnish on the rim, water condensation droplets on glass surface, 
cartoon white gloved hands and arms, cartoon legs with white shoes, 
professional CGI render, Pixar Disney animation style, studio lighting, white clean background, vibrant saturated colors`

const BASE_NEGATIVE = 'blurry, low quality, deformed, disfigured, extra limbs, bad anatomy, realistic human, photograph, dark lighting, gloomy, text, watermark, logo, signature, multiple characters, scary, horror'

const LEMON_ASSETS_DIR = path.join(process.cwd(), 'public', 'lemon-assets')

function ensureAssetsDirectory() {
  if (!fs.existsSync(LEMON_ASSETS_DIR)) {
    fs.mkdirSync(LEMON_ASSETS_DIR, { recursive: true })
    console.info('[Lemon] Created assets directory:', LEMON_ASSETS_DIR)
  }
}

function getCachedImagePath(expression: LemonExpression): string {
  return path.join(LEMON_ASSETS_DIR, `lemon-${expression}.png`)
}

function isExpressionCached(expression: LemonExpression): boolean {
  return fs.existsSync(getCachedImagePath(expression))
}

function areAllExpressionsCached(): boolean {
  const expressions: LemonExpression[] = ['neutral', 'yes', 'no', 'probably', 'probably_not', 'dont_know']
  return expressions.every(isExpressionCached)
}

async function generateLemonExpression(expression: LemonExpression, seed: number): Promise<string> {
  console.info(`[Lemon] Generating ${expression} expression...`)
  
  const expressionPrompt = EXPRESSION_PROMPTS[expression]
  const fullPrompt = `${BASE_PROMPT}, ${expressionPrompt.positive}`
  const fullNegativePrompt = `${BASE_NEGATIVE}, ${expressionPrompt.negative}`
  
  console.info(`[Lemon] Prompt: ${fullPrompt.substring(0, 100)}...`)
  console.info(`[Lemon] Negative: ${fullNegativePrompt.substring(0, 100)}...`)
  
  try {
    const response = await generateImage({
      model: IMAGE_MODEL,
      prompt: fullPrompt,
      negative_prompt: fullNegativePrompt,
      seed: seed + expression.length, // Vary seed slightly per expression
      steps: 8, // More steps for better expression accuracy
      cfg_scale: 2.0, // Higher CFG to follow prompt more closely
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

function saveImageToDisk(base64Data: string, filePath: string) {
  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)
  console.info(`[Lemon] Saved to disk: ${filePath}`)
}

async function generateAndCacheExpression(expression: LemonExpression, seed: number = 42): Promise<void> {
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

async function generateAllLemonExpressions(seed: number = 42): Promise<void> {
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

async function main() {
  console.log('\n🍋 Lemon Mascot Setup\n')
  
  if (areAllExpressionsCached()) {
    console.log('✅ All lemon expressions already exist!')
    console.log('   To regenerate, delete the public/lemon-assets/ folder and run this again.')
    process.exit(0)
  }
  
  console.log('⚠️  Make sure your Lemonade server is running with sdxl-turbo loaded!')
  console.log('   Expected endpoint: http://localhost:8000')
  console.log('')
  console.log('Generating 6 lemon expressions (this may take 30-60 seconds)...\n')
  
  try {
    await generateAllLemonExpressions(42) // Use fixed seed for consistency
    console.log('\n✅ Setup complete! Lemon mascot is ready to go.')
    console.log('   Images saved to: public/lemon-assets/')
  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    console.error('\nTroubleshooting:')
    console.error('  1. Ensure Lemonade server is running: curl http://localhost:8000/health')
    console.error('  2. Verify sdxl-turbo model is loaded')
    console.error('  3. Check GPU memory (SDXL needs ~6GB VRAM)')
    process.exit(1)
  }
}

main()
