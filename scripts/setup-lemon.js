#!/usr/bin/env node

/**
 * Setup script to generate Lemon mascot expressions
 * Run this once to pre-generate all lemon character images
 * 
 * Usage: npm run setup:lemon
 */

import { generateAllLemonExpressions, areAllExpressionsCached } from '../src/renderer/services/lemon-mascot.js'

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
