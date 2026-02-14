import { chatCompletion } from './lemonade'
import { DETECTIVE_MODEL } from '../../shared/constants'
import { DETECTIVE_SYSTEM_PROMPT, TRAIT_EXTRACTOR_PROMPT } from '../prompts/detective-system'
import type { Trait, Guess, AnswerValue } from '../types/game'

const ANSWER_LABELS: Record<AnswerValue, string> = {
  yes: 'yes',
  no: 'no',
  probably: 'probably',
  probably_not: 'probably_not',
  dont_know: 'dont_know',
}

// Words that carry no topical meaning — ignored when fingerprinting questions
const STOP_WORDS = new Set([
  'is', 'your', 'character', 'a', 'an', 'the', 'does', 'did', 'do', 'are', 'was', 'were',
  'from', 'of', 'in', 'to', 'for', 'at', 'by', 'with', 'has', 'have', 'had', 'be', 'been',
  'this', 'that', 'it', 'its', 'they', 'their', 'or', 'and', 'not', 'any', 'ever',
  'primarily', 'mainly', 'mostly', 'based', 'known', 'typically', 'often', 'usually',
])

// Semantic equivalents - questions about these are considered duplicates
const SEMANTIC_GROUPS = [
  new Set(['fictional', 'real', 'reality', 'imaginary', 'fantasy']),
  new Set(['male', 'female', 'gender', 'man', 'woman', 'boy', 'girl']),
  new Set(['human', 'person', 'people', 'humanoid', 'mortal']),
  new Set(['anime', 'manga', 'cartoon', 'animated']),
  new Set(['game', 'gaming', 'videogame', 'video']),
  new Set(['movie', 'film', 'cinema', 'theatrical']),
  new Set(['show', 'television', 'series', 'episode']),
  new Set(['comic', 'comics', 'book', 'graphic']),
  new Set(['power', 'powers', 'ability', 'abilities', 'supernatural', 'magic', 'magical']),
  new Set(['hero', 'superhero', 'villain', 'supervillain', 'protagonist', 'antagonist']),
  new Set(['weapon', 'weapons', 'sword', 'gun', 'blade', 'armed']),
  new Set(['team', 'group', 'crew', 'squad', 'organization']),
  new Set(['hair', 'hairstyle', 'haircolor']),
  new Set(['costume', 'outfit', 'clothing', 'attire', 'uniform', 'armor']),
]

// Maps trait keys to their related question keywords
// Used to detect when a question would ask about an already-confirmed trait
const TRAIT_KEY_TO_KEYWORDS: Record<string, Set<string>> = {
  'origin_medium': new Set(['originate', 'originated', 'anime', 'manga', 'game', 'videogame', 'video', 'movie', 'film', 'show', 'television', 'series', 'comic', 'comics', 'book', 'graphic', 'novel']),
  'fictional': new Set(['fictional', 'real', 'reality', 'imaginary', 'fantasy', 'exist']),
  'gender': new Set(['male', 'female', 'gender', 'man', 'woman', 'boy', 'girl']),
  'species': new Set(['human', 'person', 'people', 'humanoid', 'mortal', 'alien', 'robot', 'animal', 'creature']),
  'has_powers': new Set(['power', 'powers', 'ability', 'abilities', 'supernatural', 'magic', 'magical', 'superpower']),
}

// Extract the topical keywords from a question
function topicWords(question: string): Set<string> {
  return new Set(
    question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  )
}

// Check if two words are semantically related
function areSemanticallyRelated(word1: string, word2: string): boolean {
  // Direct match
  if (word1 === word2) return true
  // Check if both words are in the same semantic group
  for (const group of SEMANTIC_GROUPS) {
    if (group.has(word1) && group.has(word2)) return true
  }
  // Check substring relationships (e.g., "power" and "powers", "super" and "superhero")
  if (word1.includes(word2) || word2.includes(word1)) return true
  return false
}

// Check if a question is about an already-confirmed trait key
function isAboutConfirmedTrait(question: string, confirmedTraitKeys: Set<string>): boolean {
  const words = topicWords(question)
  
  for (const traitKey of confirmedTraitKeys) {
    const keywords = TRAIT_KEY_TO_KEYWORDS[traitKey]
    if (!keywords) continue
    
    // Check if any word in the question matches keywords for this trait
    for (const word of words) {
      if (keywords.has(word)) {
        console.info(`[Detective] Question "${question}" is about already-confirmed trait: ${traitKey}`)
        return true
      }
    }
  }
  
  return false
}

// Returns true if newQ is topically too similar to an already-asked question
function isDuplicateTopic(newQ: string, prevQuestions: string[]): boolean {
  const newWords = topicWords(newQ)
  if (newWords.size === 0) return false
  
  for (const prev of prevQuestions) {
    const prevWords = topicWords(prev)
    
    // Count overlapping or semantically related topic words
    let overlap = 0
    for (const newWord of newWords) {
      for (const prevWord of prevWords) {
        if (areSemanticallyRelated(newWord, prevWord)) {
          overlap++
          break
        }
      }
    }
    
    // If 2+ topic words overlap, or the entire new question is covered, it's a repeat
    if (overlap >= 2 || (newWords.size <= 2 && overlap >= 1)) return true
  }
  return false
}

// Ordered fallback questions to use when the model repeats a topic
const FALLBACK_QUESTIONS = [
  'Is your character fictional?',
  'Is your character male?',
  'Is your character human?',
  'Did your character originate in an anime or manga series?',
  'Did your character originate in a video game?',
  'Did your character originate in a comic book?',
  'Did your character originate in a movie?',
  'Did your character originate in a TV show?',
  'Does your character have supernatural powers or abilities?',
  'Does your character have a distinctive hair color (not black or brown)?',
  'Does your character typically wear armor or a costume?',
  'Is your character known for being a villain or antagonist?',
  'Is your character part of a team or group?',
  'Does your character use a weapon?',
  'Is your character associated with a specific color or symbol?',
]

function pickFallback(prevQuestions: string[], confirmedTraitKeys: Set<string>): string {
  for (const q of FALLBACK_QUESTIONS) {
    if (!isDuplicateTopic(q, prevQuestions) && !isAboutConfirmedTrait(q, confirmedTraitKeys)) {
      return q
    }
  }
  return 'Does your character have any distinctive accessories?'
}

// Parse any JSON object out of a raw LLM response
function extractJSON(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()
  try {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* ignore */ }
  return null
}

// Call 1: Extract a single trait from the last answered question
async function extractTrait(
  question: string,
  answer: AnswerValue,
): Promise<Trait | null> {
  if (answer === 'dont_know') return null

  const response = await chatCompletion({
    model: DETECTIVE_MODEL,
    messages: [
      { role: 'system', content: TRAIT_EXTRACTOR_PROMPT },
      { role: 'user', content: `Q: "${question}" A: "${ANSWER_LABELS[answer]}"` },
    ],
    temperature: 0.1,
    max_tokens: 80,
  })

  const raw = response.choices[0]?.message?.content || ''
  console.info('[Detective] extractTrait raw:', raw)
  const json = extractJSON(raw)
  if (!json || !json.key || !json.value) return null

  const value = String(json.value).toLowerCase()
  const badValues = ['unknown', 'unclear', 'n/a', 'none', 'not_applicable', '{}', '']
  if (badValues.includes(value) || value.startsWith('not_') || value.startsWith('non_')) return null

  let key = String(json.key)
  let finalValue = String(json.value)

  // Client-side fix: Validate real/fictional logic
  // "Is your character real?" + "no" should give fictional=true (not fictional=false)
  if (key === 'fictional' && question.toLowerCase().includes('real')) {
    const isNegativeAnswer = answer === 'no' || answer === 'probably_not'
    const isPositiveAnswer = answer === 'yes' || answer === 'probably'
    
    if (isNegativeAnswer && finalValue.toLowerCase() === 'false') {
      console.warn('[Detective] Correcting fictional extraction: real=no means fictional=true')
      finalValue = 'true'
    } else if (isPositiveAnswer && finalValue.toLowerCase() === 'true') {
      console.warn('[Detective] Correcting fictional extraction: real=yes means fictional=false')
      finalValue = 'false'
    }
  }

  return {
    key,
    value: finalValue,
    confidence: Math.min(Math.max(Number(json.confidence) || 0.7, 0.1), 0.99),
    turnAdded: 0,
  }
}

// Call 2: Ask the next question given all confirmed traits and history
async function askNextQuestion(
  traits: Trait[],
  turns: Array<{ question: string; answer: AnswerValue }>,
  rejectedGuesses: string[],
): Promise<{ question: string; topGuesses: Guess[] }> {
  const prevQuestions = turns.map(t => t.question)
  const parts: string[] = []

  if (traits.length > 0) {
    const confirmedKeys = Array.from(new Set(traits.map(t => t.key))).join(', ')
    const traitLines = traits.map(t => `  ${t.key} = ${t.value} (${Math.round(t.confidence * 100)}%)`).join('\n')
    
    // Add explicit warnings for single-value traits
    const warnings: string[] = []
    const traitKeySet = new Set(traits.map(t => t.key))
    if (traitKeySet.has('origin_medium')) {
      warnings.push('  ⚠️ origin_medium is confirmed - DO NOT ask about anime, manga, games, movies, TV shows, or comics')
    }
    if (traitKeySet.has('gender')) {
      warnings.push('  ⚠️ gender is confirmed - DO NOT ask about male/female')
    }
    if (traitKeySet.has('species')) {
      warnings.push('  ⚠️ species is confirmed - DO NOT ask about human/non-human')
    }
    if (traitKeySet.has('fictional')) {
      warnings.push('  ⚠️ fictional status is confirmed - DO NOT ask about real/fictional')
    }
    
    const warningText = warnings.length > 0 ? '\n' + warnings.join('\n') : ''
    parts.push(`Confirmed traits (NEVER ask about these trait keys again: ${confirmedKeys}):\n${traitLines}${warningText}`)
  } else {
    parts.push('Confirmed traits: none yet')
  }

  if (prevQuestions.length > 0) {
    const qaHistory = turns.map((t, i) => `  ${i + 1}. Q: "${t.question}" A: ${ANSWER_LABELS[t.answer]}`).join('\n')
    parts.push(`Questions already asked with answers (STRICTLY FORBIDDEN to repeat any of these topics):\n${qaHistory}`)
  }

  if (rejectedGuesses.length > 0) {
    parts.push(`Rejected guesses (never guess these): ${rejectedGuesses.join(', ')}`)
  }

  parts.push(`Turn: ${turns.length + 1}. Ask ONE NEW yes/no question exploring a completely different topic. Return JSON only, no explanation.`)

  const response = await chatCompletion({
    model: DETECTIVE_MODEL,
    messages: [
      { role: 'system', content: DETECTIVE_SYSTEM_PROMPT },
      { role: 'user', content: parts.join('\n\n') },
    ],
    temperature: 0.4,
    max_tokens: 150,
  })

  const raw = response.choices[0]?.message?.content || ''
  console.info('[Detective] askNextQuestion raw:', raw)
  const json = extractJSON(raw)

  let question: string = json?.question ? String(json.question) : ''

  // Fix "or" questions
  if (question.toLowerCase().includes(' or ')) {
    question = question.replace(/\s+or\s+[^?]*/i, '')
    if (!question.endsWith('?')) question += '?'
  }

  // Client-side duplicate check — fall back to a structured question if the model repeated
  const confirmedTraitKeys = new Set(traits.map(t => t.key))
  if (!question || isDuplicateTopic(question, prevQuestions) || isAboutConfirmedTrait(question, confirmedTraitKeys)) {
    const fallback = pickFallback(prevQuestions, confirmedTraitKeys)
    console.warn('[Detective] Duplicate/empty/redundant question detected, using fallback:', fallback)
    question = fallback
  }

  const topGuesses: Guess[] = Array.isArray(json?.top_guesses)
    ? (json.top_guesses as any[])
        .filter(g => g.name && typeof g.confidence === 'number')
        .filter(g => !rejectedGuesses.some(r => r.toLowerCase() === String(g.name).toLowerCase()))
        .map(g => ({
          name: String(g.name),
          confidence: Math.min(Math.max(Number(g.confidence), 0.01), 0.99),
        }))
    : []

  return { question, topGuesses }
}

export async function askDetective(
  traits: Trait[],
  turns: Array<{ question: string; answer: AnswerValue }>,
  turnNumber: number,
  rejectedGuesses: string[] = [],
): Promise<{ question: string; newTraits: Trait[]; topGuesses: Guess[] }> {
  const lastTurn = turns[turns.length - 1]

  // Step 1: extract trait from last answered question
  const trait = lastTurn ? await extractTrait(lastTurn.question, lastTurn.answer) : null
  const newTraits: Trait[] = trait ? [{ ...trait, turnAdded: turnNumber }] : []

  console.info('[Detective] newTraits:', newTraits, '| all traits:', [...traits, ...newTraits])

  // Step 2: ask next question with updated trait list so model avoids confirmed topics
  const updatedTraits = trait
    ? [...traits.filter(t => t.key !== trait.key), { ...trait, turnAdded: turnNumber }]
    : traits

  const { question, topGuesses } = await askNextQuestion(updatedTraits, turns, rejectedGuesses)

  console.info('[Detective] question:', question, '| topGuesses:', topGuesses)

  return { question, newTraits, topGuesses }
}
