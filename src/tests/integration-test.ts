/**
 * Integration Test Runner
 * 
 * Runs automated games to test Detective AI performance
 * Usage: npm run test:integration -- --games=50 --category=actors
 */

import { type CharacterKnowledge } from '../renderer/services/character-rag'
import { askDetective } from '../renderer/services/detective-rag'
import { simulateAnswer, calculateMetrics, formatMetrics, type GameResult } from './automated-gameplay'
import type { Trait } from '../renderer/services/character-rag'
import type { AnswerValue } from '../renderer/types/game'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Load character knowledge from filesystem (Node.js compatible)
 */
async function loadCharacterKnowledgeNode(): Promise<CharacterKnowledge> {
  const jsonPath = path.join(__dirname, '../../public/character-knowledge.json')
  const data = fs.readFileSync(jsonPath, 'utf-8')
  return JSON.parse(data)
}

interface TestOptions {
  numGames?: number
  category?: string
  maxTurns?: number
  verbose?: boolean
}

/**
 * Run a single automated game
 */
async function runGame(
  characterName: string,
  options: { maxTurns: number; verbose: boolean }
): Promise<GameResult> {
  const knowledge = await loadCharacterKnowledgeNode()
  const character = knowledge.characters[characterName]
  
  if (!character) {
    throw new Error(`Character not found: ${characterName}`)
  }
  
  if (options.verbose) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Testing: ${character.name} (${character.category})`)
    console.log('='.repeat(60))
  }
  
  const traits: Trait[] = []
  const questionHistory: Array<{ question: string; answer: string }> = []
  let success = false
  let correctGuessRank: number | null = null
  let turnsToGuess = options.maxTurns
  
  for (let turn = 0; turn < options.maxTurns; turn++) {
    const turnHistory = questionHistory.map(qh => ({ question: qh.question, answer: qh.answer as AnswerValue }))
    
    // Get previous question and answer for this turn (if exists)
    const lastTurn = turnHistory[turnHistory.length - 1]
    const previousQuestion = lastTurn?.question
    const previousAnswer = lastTurn?.answer
    
    // Ask detective for next question
    const result = await askDetective(
      traits,
      turnHistory.slice(0, -1), // All except last (since last is passed separately)
      turn + 1,
      [], // no rejected guesses in automated testing
      previousQuestion,
      previousAnswer
    )
    
    if (options.verbose) {
      console.log(`\nTurn ${turn + 1}: ${result.question}`)
    }
    
    // Check if detective is making a guess
    if (result.question.toLowerCase().includes('is your character one of these') ||
        result.question.toLowerCase().includes('am i close') ||
        result.question.toLowerCase().includes('i think your character is')) {
      
      // Check if correct character is in top guesses
      const guessNames = result.topGuesses?.map(g => g.name.toLowerCase()) || []
      const charNameLower = character.name.toLowerCase()
      const rank = guessNames.findIndex(name => name === charNameLower)
      
      if (rank >= 0) {
        success = true
        correctGuessRank = rank + 1
        turnsToGuess = turn + 1
        
        if (options.verbose) {
          console.log(`  ✓ CORRECT! Found at rank ${correctGuessRank}`)
          console.log(`  Guesses: ${result.topGuesses?.map(g => g.name).join(', ')}`)
        }
        
        break
      } else {
        if (options.verbose) {
          console.log(`  ✗ Wrong guesses: ${result.topGuesses?.map(g => g.name).join(', ')}`)
          console.log(`  (Looking for: ${character.name})`)
        }
        // Continue playing even after wrong guess
      }
    }
    
    // Simulate answer
    const answer = simulateAnswer(result.question, character)
    questionHistory.push({ question: result.question, answer })
    
    if (options.verbose) {
      console.log(`  Answer: ${answer}`)
    }
    
    // Add new traits
    if (result.newTraits && result.newTraits.length > 0) {
      for (const trait of result.newTraits) {
        // Avoid duplicates
        const exists = traits.some(t => t.key === trait.key && t.value === trait.value)
        if (!exists) {
          traits.push(trait)
        }
      }
      
      if (options.verbose) {
        console.log(`  New traits: ${result.newTraits.map(t => `${t.key}=${t.value}`).join(', ')}`)
      }
    }
    
    // Show top guesses if available
    if (options.verbose && result.topGuesses && result.topGuesses.length > 0) {
      console.log(`  Top guesses: ${result.topGuesses.map(g => `${g.name} (${(g.confidence * 100).toFixed(0)}%)`).join(', ')}`)
    }
  }
  
  if (options.verbose) {
    console.log(`\n${success ? '✓ SUCCESS' : '✗ FAILED'} - ${turnsToGuess} turns`)
  }
  
  return {
    characterName: character.name,
    category: character.category,
    success,
    turnsToGuess,
    totalTurns: questionHistory.length,
    finalGuesses: [],
    correctGuessRank,
    traits,
    questionHistory
  }
}

/**
 * Run multiple automated games
 */
export async function runIntegrationTests(options: TestOptions = {}) {
  const {
    numGames = 10,
    category,
    maxTurns = 25,
    verbose = false
  } = options
  
  console.log('\n' + '='.repeat(60))
  console.log('DETECTIVE AI INTEGRATION TESTS')
  console.log('='.repeat(60))
  console.log(`Games: ${numGames}`)
  console.log(`Max Turns: ${maxTurns}`)
  if (category) {
    console.log(`Category Filter: ${category}`)
  }
  console.log('='.repeat(60))
  
  // Load character knowledge
  const knowledge = await loadCharacterKnowledgeNode()
  let characters = Object.keys(knowledge.characters)
  
  // Filter by category if specified
  if (category) {
    characters = characters.filter(name => 
      knowledge.characters[name].category === category
    )
  }
  
  if (characters.length === 0) {
    console.error('No characters found matching criteria')
    return
  }
  
  // Randomly select characters
  const selectedCharacters: string[] = []
  for (let i = 0; i < Math.min(numGames, characters.length); i++) {
    const randomIndex = Math.floor(Math.random() * characters.length)
    selectedCharacters.push(characters[randomIndex])
    characters.splice(randomIndex, 1) // Remove to avoid duplicates
  }
  
  // Run games
  const results: GameResult[] = []
  for (let i = 0; i < selectedCharacters.length; i++) {
    const charName = selectedCharacters[i]
    
    if (!verbose) {
      process.stdout.write(`\rTesting: ${i + 1}/${selectedCharacters.length} - ${charName.padEnd(30)} `)
    }
    
    try {
      const result = await runGame(charName, { maxTurns, verbose })
      results.push(result)
      
      if (!verbose) {
        const status = result.success ? '✓' : '✗'
        console.log(`${status} (${result.turnsToGuess} turns)`)
      }
    } catch (error) {
      console.error(`\nError testing ${charName}:`, error)
    }
  }
  
  // Calculate and display metrics
  const metrics = calculateMetrics(results)
  console.log('\n' + formatMetrics(metrics))
  
  // Save detailed results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const resultsFile = `test-results-${timestamp}.json`
  
  const fs = require('fs')
  const path = require('path')
  const resultsPath = path.join(__dirname, '../../', resultsFile)
  
  fs.writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    options: { numGames, category, maxTurns },
    metrics,
    results
  }, null, 2))
  
  console.log(`\nDetailed results saved to: ${resultsFile}`)
  
  return metrics
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2)
  const options: TestOptions = {}
  
  for (const arg of args) {
    if (arg.startsWith('--games=')) {
      options.numGames = parseInt(arg.split('=')[1])
    } else if (arg.startsWith('--category=')) {
      options.category = arg.split('=')[1]
    } else if (arg.startsWith('--max-turns=')) {
      options.maxTurns = parseInt(arg.split('=')[1])
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
    }
  }
  
  runIntegrationTests(options)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error)
      process.exit(1)
    })
}
