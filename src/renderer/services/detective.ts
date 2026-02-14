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

// Session-based learning: track what we learn during the game
interface SessionLearning {
  // Characters that were guessed incorrectly with their traits at time of guess
  rejectedCharacters: Array<{
    name: string
    traitsWhenGuessed: Trait[]
    turnRejected: number
  }>
  
  // Questions that got "don't know" answers (ambiguous/unclear)
  ambiguousQuestions: Array<{
    question: string
    turn: number
  }>
  
  // Learned character traits from rejections
  learnedCharacterTraits: Record<string, Partial<Record<string, string>>>
}

// Session learning singleton (reset each game)
let sessionLearning: SessionLearning = {
  rejectedCharacters: [],
  ambiguousQuestions: [],
  learnedCharacterTraits: {}
}

// Cache for web-searched character info (persists during session)
const webSearchCache: Record<string, { powers: boolean; gender: string; species: string; fictional: boolean; alignment?: string } | null> = {}

// Search for character information using web search
async function searchCharacterInfo(characterName: string): Promise<{ powers: boolean; gender: string; species: string; fictional: boolean; alignment?: string } | null> {
  const nameLower = characterName.toLowerCase()
  
  // Check cache first
  if (nameLower in webSearchCache) {
    console.info(`[WebSearch] Using cached info for "${characterName}"`)
    return webSearchCache[nameLower]
  }
  
  try {
    console.info(`[WebSearch] Searching for character: "${characterName}"`)
    
    // Search for the person/character - neutral query that works for both real and fictional
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(characterName)}&format=json&no_html=1`
    
    const response = await fetch(searchUrl)
    if (!response.ok) {
      console.warn(`[WebSearch] Search failed for "${characterName}":`, response.status)
      webSearchCache[nameLower] = null
      return null
    }
    
    const data = await response.json()
    const abstract = (data.Abstract || data.AbstractText || '').toLowerCase()
    const heading = (data.Heading || '').toLowerCase()
    
    if (!abstract && !heading) {
      console.warn(`[WebSearch] No information found for "${characterName}"`)
      webSearchCache[nameLower] = null
      return null
    }
    
    // Extract traits from the text
    const text = `${heading} ${abstract}`
    
    // Determine if fictional or real person
    let fictional = true // Default to fictional
    
    // Strong indicators of real people
    const realPersonIndicators = [
      'born', 'died', 'death', 'president', 'politician', 'actor', 'actress',
      'musician', 'singer', 'artist', 'scientist', 'inventor', 'author', 'writer',
      'director', 'athlete', 'sports', 'ceo', 'founder', 'businessman', 'businesswoman',
      'activist', 'leader', 'prime minister', 'king', 'queen', 'emperor', 'general',
      'served as', 'elected', 'biography', 'historical figure', 'nobel prize',
      'olympics', 'world war', 'assassination', 'married to'
    ]
    
    // Strong indicators of fictional characters
    const fictionalIndicators = [
      'fictional character', 'character from', 'protagonist', 'antagonist',
      'appears in', 'created by', 'portrayed by', 'voiced by', 'anime', 'manga',
      'comic book', 'video game', 'novel character', 'movie character',
      'superhero', 'supervillain'
    ]
    
    // Count indicators
    const realCount = realPersonIndicators.filter(indicator => text.includes(indicator)).length
    const fictionalCount = fictionalIndicators.filter(indicator => text.includes(indicator)).length
    
    // Determine fictional status based on indicators
    if (realCount > fictionalCount) {
      fictional = false
      console.info(`[WebSearch] Detected REAL person for "${characterName}" (real indicators: ${realCount}, fictional: ${fictionalCount})`)
    } else if (fictionalCount > 0) {
      fictional = true
      console.info(`[WebSearch] Detected FICTIONAL character for "${characterName}" (fictional indicators: ${fictionalCount}, real: ${realCount})`)
    }
    
    // Determine gender
    let gender = 'unknown'
    if (text.includes(' he ') || text.includes(' his ') || text.includes('male') || text.includes(' him ')) {
      gender = 'male'
    } else if (text.includes(' she ') || text.includes(' her ') || text.includes('female')) {
      gender = 'female'
    }
    
    // Determine if has powers (only for fictional characters, real people don't have powers)
    const hasPowers = fictional && (
      text.includes('power') || text.includes('super') || text.includes('magic') || 
      text.includes('ability') || text.includes('abilities') || text.includes('wizard') ||
      text.includes('mutant') || text.includes('superhero')
    )
    
    // Determine species (real people are always human)
    let species = 'human'
    if (fictional) {
      if (text.includes('alien') || text.includes('extraterrestrial')) {
        species = 'alien'
      } else if (text.includes('robot') || text.includes('android') || text.includes('cyborg')) {
        species = 'robot'
      } else if (text.includes('god') || text.includes('deity')) {
        species = 'god'
      } else if (text.includes('animal') || text.includes('mouse') || text.includes('duck') || text.includes('creature')) {
        species = 'animal'
      }
    }
    
    // Determine alignment (only applicable to characters, not real people in most cases)
    let alignment: string | undefined
    if (text.includes('hero') || text.includes('protagonist') || text.includes('saves')) {
      alignment = 'hero'
    } else if (text.includes('villain') || text.includes('antagonist') || text.includes('evil')) {
      alignment = 'villain'
    }
    
    const info = {
      powers: hasPowers,
      gender,
      species,
      fictional,
      alignment
    }
    
    console.info(`[WebSearch] Found info for "${characterName}":`, info)
    webSearchCache[nameLower] = info
    return info
    
  } catch (error) {
    console.warn(`[WebSearch] Error searching for "${characterName}":`, error)
    webSearchCache[nameLower] = null
    return null
  }
}

// Reset session learning for new game
export function resetSessionLearning(): void {
  sessionLearning = {
    rejectedCharacters: [],
    ambiguousQuestions: [],
    learnedCharacterTraits: {}
  }
  console.info('[Detective] Session learning reset for new game')
}

// Record a rejected guess to learn from it
export function recordRejectedGuess(characterName: string, traitsAtRejection: Trait[], turnNumber: number): void {
  sessionLearning.rejectedCharacters.push({
    name: characterName,
    traitsWhenGuessed: [...traitsAtRejection],
    turnRejected: turnNumber
  })
  
  // Infer what traits this character DOESN'T have based on confirmed traits
  const learned: Partial<Record<string, string>> = {}
  for (const trait of traitsAtRejection) {
    learned[trait.key] = `NOT:${trait.value}` // Mark as opposite
  }
  
  sessionLearning.learnedCharacterTraits[characterName.toLowerCase()] = learned
  
  console.info(`[Detective] Learned from rejection: ${characterName} does NOT match current traits`)
  console.info(`[Detective] Learned traits for ${characterName}:`, learned)
}

// Record an ambiguous question
export function recordAmbiguousQuestion(question: string, turnNumber: number): void {
  sessionLearning.ambiguousQuestions.push({
    question,
    turn: turnNumber
  })
  console.info(`[Detective] Marked question as ambiguous (turn ${turnNumber}): "${question}"`)
}

// Words that carry no topical meaning — ignored when fingerprinting questions
const STOP_WORDS = new Set([
  'is', 'your', 'character', 'a', 'an', 'the', 'does', 'did', 'do', 'are', 'was', 'were',
  'from', 'of', 'in', 'to', 'for', 'at', 'by', 'with', 'has', 'have', 'had', 'be', 'been',
  'this', 'that', 'it', 'its', 'they', 'their', 'or', 'and', 'not', 'any', 'ever',
  'primarily', 'mainly', 'mostly', 'based', 'known', 'typically', 'often', 'usually',
  // Common verbs that don't indicate topic similarity
  'use', 'uses', 'wear', 'wears', 'wearing', 'associated', 'part',
  // Words that make questions overly specific
  'specific', 'particular', 'certain', 'background',
])

// Patterns that indicate overly specific questions - these get auto-rejected
const FORBIDDEN_PATTERNS = [
  /background in/i,
  /background as/i,
  /history of/i,
  /history as/i,
  /experience in/i,
  /experience as/i,
  /training in/i,
  /training as/i,
  /career in/i,
  /career as/i,
  /profession of/i,
  /work as a [a-z]+\s[a-z]+/i,  // "work as a newspaper reporter"
]

// Semantic equivalents - ONLY true synonyms (words meaning the same thing)
// DO NOT group different values within a category (e.g., hero vs villain, sword vs gun)
const SEMANTIC_GROUPS = [
  new Set(['fictional', 'imaginary', 'fantasy']),
  new Set(['real', 'reality', 'actual']),
  new Set(['male', 'man', 'boy']),
  new Set(['female', 'woman', 'girl']),
  new Set(['gender', 'sex']),
  new Set(['human', 'person', 'people', 'mortal']),
  new Set(['anime', 'manga']),  // Close enough for our purposes
  new Set(['cartoon', 'animated', 'animation']),
  new Set(['game', 'gaming', 'videogame', 'video']),
  new Set(['movie', 'film', 'cinema']),
  new Set(['show', 'television', 'series', 'program']),
  new Set(['comic', 'comics', 'graphic']),
  new Set(['power', 'powers', 'ability', 'abilities']),
  new Set(['supernatural', 'magic', 'magical']),
  new Set(['hero', 'superhero', 'protagonist']),
  new Set(['villain', 'supervillain', 'antagonist']),
  new Set(['team', 'group', 'crew', 'squad', 'organization']),
  new Set(['weapon', 'weapons', 'armed']),
  // Politics and related concepts
  new Set(['political', 'politics', 'politician', 'campaign', 'election', 'elected', 'office']),
  new Set(['government', 'govern', 'governance', 'administration']),
  new Set(['debate', 'debating', 'argument', 'arguing']),
  new Set(['rival', 'enemy', 'opposition', 'opponent', 'adversary', 'foe']),
  new Set(['ally', 'allies', 'friend', 'partner', 'supporter']),
  new Set(['reform', 'change', 'transformation', 'reforming']),
  new Set(['legislation', 'law', 'laws', 'legal', 'legislative']),
  new Set(['advocacy', 'advocate', 'advocating', 'champion', 'championing']),
  // Communication and media
  new Set(['communication', 'communicate', 'communicating', 'message', 'messaging']),
  new Set(['journalism', 'journalist', 'reporter', 'press', 'news', 'media']),
  // Job/occupation/background/training - all about work history
  new Set(['background', 'history', 'experience', 'training', 'education', 'studied']),
  new Set(['occupation', 'job', 'career', 'profession', 'work', 'working', 'employed']),
  // Note: NOT grouping specific weapons (sword, gun, blade) - they're different!
  // Note: NOT grouping clothing types (costume, armor) - they're different!
]

// Hierarchical topic realms - broader concepts that encompass specific questions
// If a specific question in a realm was asked, don't ask broader questions in same realm
const TOPIC_REALMS: Record<string, Set<string>> = {
  // Hair-related questions (specific → broad)
  'hair': new Set(['hair', 'hairstyle', 'blonde', 'brunette', 'redhead', 'black-haired', 'bald', 'shaved', 'long-haired', 'short-haired', 'curly', 'straight']),
  
  // Clothing-related questions
  'clothing': new Set(['clothing', 'clothes', 'wear', 'costume', 'armor', 'uniform', 'suit', 'dress', 'cape', 'cloak', 'hat', 'mask', 'outfit']),
  
  // Accessories
  'accessories': new Set(['accessories', 'accessory', 'glasses', 'eyewear', 'jewelry', 'necklace', 'ring', 'bracelet', 'watch', 'belt', 'gloves']),
  
  // Eye-related
  'eyes': new Set(['eye', 'eyes', 'eye-color', 'blue-eyed', 'brown-eyed', 'green-eyed', 'glowing-eyes']),
  
  // Physical build
  'build': new Set(['build', 'body', 'physique', 'muscular', 'thin', 'fat', 'tall', 'short', 'athletic', 'strong', 'weak']),
  
  // Facial features
  'face': new Set(['face', 'facial', 'beard', 'mustache', 'goatee', 'scar', 'tattoo', 'marking']),
  
  // Powers/abilities (general)
  'powers': new Set(['power', 'powers', 'ability', 'abilities', 'superpower', 'supernatural', 'magic', 'strength', 'flight', 'speed', 'teleport']),
  
  // Weapons
  'weapons': new Set(['weapon', 'weapons', 'sword', 'gun', 'knife', 'blade', 'bow', 'staff', 'armed', 'armed-combat']),
  
  // Relationships
  'relationships': new Set(['relationship', 'partner', 'spouse', 'friend', 'ally', 'sidekick', 'companion', 'mentor', 'student']),
  
  // Location/setting
  'location': new Set(['location', 'place', 'city', 'country', 'planet', 'world', 'live', 'from', 'reside']),
  
  // Occupation/work
  'occupation': new Set(['occupation', 'job', 'work', 'career', 'profession', 'employed', 'worker']),
  
  // Personality traits
  'personality': new Set(['personality', 'character-trait', 'brave', 'cowardly', 'smart', 'intelligent', 'funny', 'serious', 'kind', 'cruel', 'arrogant', 'humble']),
}

// Check if a question falls within a topic realm that was already explored
function isInAlreadyExploredRealm(newQuestion: string, prevQuestions: string[]): boolean {
  const newWords = topicWords(newQuestion)
  
  // Find which realm(s) the new question belongs to
  const newRealms: string[] = []
  for (const [realm, keywords] of Object.entries(TOPIC_REALMS)) {
    for (const word of newWords) {
      if (keywords.has(word)) {
        newRealms.push(realm)
        break
      }
    }
  }
  
  if (newRealms.length === 0) return false // Not in any tracked realm
  
  // Check if any previous question was in the same realm
  for (const prevQ of prevQuestions) {
    const prevWords = topicWords(prevQ)
    
    for (const realm of newRealms) {
      const keywords = TOPIC_REALMS[realm]
      // Check if previous question touched this realm
      for (const word of prevWords) {
        if (keywords.has(word)) {
          // Both questions are in same realm - check if new is broader
          const newSpecificity = getSpecificity(newQuestion, realm)
          const prevSpecificity = getSpecificity(prevQ, realm)
          
          // If new question is broader or same specificity as previous, it's redundant
          if (newSpecificity <= prevSpecificity) {
            console.info(`[Detective] Question "${newQuestion}" is in already-explored realm "${realm}" (previous: "${prevQ}")`)
            return true
          }
        }
      }
    }
  }
  
  return false
}

// Estimate question specificity (higher = more specific)
// Specific mentions of traits (blonde, glasses) are more specific than general (hair, accessories)
function getSpecificity(question: string, realm: string): number {
  const lower = question.toLowerCase()
  
  // Realm-specific scoring
  if (realm === 'hair') {
    if (lower.includes('blonde') || lower.includes('brunette') || lower.includes('redhead')) return 3 // Very specific
    if (lower.includes('long') || lower.includes('short') || lower.includes('curly')) return 2 // Somewhat specific
    if (lower.includes('distinctive') || lower.includes('hair color')) return 1 // Broad
    return 0
  }
  
  if (realm === 'clothing') {
    if (lower.includes('red cape') || lower.includes('blue suit')) return 3 // Very specific
    if (lower.includes('cape') || lower.includes('armor') || lower.includes('costume')) return 2 // Somewhat specific
    if (lower.includes('distinctive') || lower.includes('special clothing')) return 1 // Broad
    return 0
  }
  
  if (realm === 'accessories') {
    if (lower.includes('round glasses') || lower.includes('gold ring')) return 3 // Very specific
    if (lower.includes('glasses') || lower.includes('jewelry')) return 2 // Somewhat specific
    if (lower.includes('distinctive') || lower.includes('accessories')) return 1 // Broad
    return 0
  }
  
  // Default: check for "distinctive" or "specific" keywords (indicates broader question)
  if (lower.includes('distinctive') || lower.includes('specific') || lower.includes('notable') || lower.includes('known for')) {
    return 1 // Broad question
  }
  
  return 2 // Assume moderately specific by default
}

// Maps trait keys to their related question keywords
// Used to detect when a question would ask about an already-confirmed trait
const TRAIT_KEY_TO_KEYWORDS: Record<string, Set<string>> = {
  'origin_medium': new Set(['originate', 'originated', 'anime', 'manga', 'game', 'videogame', 'video', 'movie', 'film', 'show', 'television', 'series', 'comic', 'comics', 'book', 'graphic', 'novel']),
  'fictional': new Set(['fictional', 'real', 'reality', 'imaginary', 'fantasy', 'exist']),
  'gender': new Set(['male', 'female', 'gender', 'man', 'woman', 'boy', 'girl']),
  'species': new Set(['human', 'person', 'people', 'humanoid', 'mortal', 'alien', 'robot', 'animal', 'creature']),
  'has_powers': new Set(['power', 'powers', 'ability', 'abilities', 'supernatural', 'magic', 'magical', 'superpower']),
  'alignment': new Set(['hero', 'heroic', 'villain', 'antagonist', 'protagonist', 'good', 'evil', 'bad']),
  'morality': new Set(['good', 'bad', 'evil', 'moral', 'immoral', 'ethical']),
  'age_group': new Set(['child', 'kid', 'teenager', 'teen', 'adult', 'young', 'old', 'age']),
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

// Check if a question is logically incompatible with confirmed traits
// E.g., asking about wings when character is confirmed human
function isLogicallyIncompatible(question: string, traits: Trait[]): boolean {
  const lowerQ = question.toLowerCase()
  
  // Find relevant trait values
  const species = traits.find(t => t.key === 'species')?.value?.toLowerCase()
  const hasPowers = traits.find(t => t.key === 'has_powers')?.value?.toLowerCase()
  const fictional = traits.find(t => t.key === 'fictional')?.value?.toLowerCase()
  
  // If character is human, don't ask about non-human physical traits
  if (species === 'human' || species === 'person' || species === 'mortal') {
    const nonHumanTraits = [
      'tail', 'tails', 'wing', 'wings', 'scale', 'scales', 'scaled',
      'pointed ears', 'pointy ears', 'elf ears', 'antenna', 'antennae',
      'tentacle', 'tentacles', 'claws', 'fangs', 'fur', 'furry', 'feathers',
      'beak', 'snout', 'muzzle', 'horns', 'hooves'
    ]
    if (nonHumanTraits.some(trait => lowerQ.includes(trait))) {
      console.info(`[Detective] Question "${question}" asks about non-human trait but character is human`)
      return true
    }
  }
  
  // If character has no powers, don't ask about specific power types
  if (hasPowers === 'false' || hasPowers === 'no') {
    const powerQuestions = [
      'fly', 'flying', 'flight', 'teleport', 'telepathy', 'telekinesis',
      'super strength', 'super speed', 'invisibility', 'invisible',
      'time control', 'time travel', 'shapeshif', 'transform',
      'heal others', 'healing powers', 'mind reading', 'read minds',
      'laser', 'energy blast', 'fire powers', 'ice powers', 'lightning',
      'x-ray vision', 'enhanced senses', 'regeneration', 'immortal'
    ]
    if (powerQuestions.some(power => lowerQ.includes(power))) {
      console.info(`[Detective] Question "${question}" asks about powers but character has no powers`)
      return true
    }
  }
  
  // If character is real/non-fictional, certain fantasy elements don't make sense
  if (fictional === 'false' || fictional === 'no' || fictional === 'real') {
    const fantasyElements = [
      'magic', 'magical', 'spell', 'wizard', 'witch', 'supernatural',
      'vampire', 'werewolf', 'zombie', 'ghost', 'demon', 'angel',
      'dragon', 'elf', 'dwarf', 'orc', 'fairy', 'mythical', 'legendary creature'
    ]
    if (fantasyElements.some(elem => lowerQ.includes(elem))) {
      console.info(`[Detective] Question "${question}" asks about fantasy element but character is real`)
      return true
    }
  }
  
  return false
}

// Check if a character guess is compatible with confirmed traits
async function isGuessCompatible(guessName: string, traits: Trait[]): Promise<boolean> {
  const name = guessName.toLowerCase()
  
  // Get confirmed trait values
  const species = traits.find(t => t.key === 'species')?.value?.toLowerCase()
  const hasPowers = traits.find(t => t.key === 'has_powers')?.value?.toLowerCase()
  const gender = traits.find(t => t.key === 'gender')?.value?.toLowerCase()
  const fictional = traits.find(t => t.key === 'fictional')?.value?.toLowerCase()
  const alignment = traits.find(t => t.key === 'alignment')?.value?.toLowerCase()
  
  // Known character trait database (expand as needed)
  const characterTraits: Record<string, { powers: boolean; gender: string; species: string; fictional: boolean; alignment?: string }> = {
    // Fictional characters
    'superman': { powers: true, gender: 'male', species: 'alien', fictional: true, alignment: 'hero' },
    'batman': { powers: false, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'wonder woman': { powers: true, gender: 'female', species: 'demigod', fictional: true, alignment: 'hero' },
    'iron man': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'captain america': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'spider-man': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'spiderman': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'hulk': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'thor': { powers: true, gender: 'male', species: 'god', fictional: true, alignment: 'hero' },
    'black widow': { powers: false, gender: 'female', species: 'human', fictional: true, alignment: 'hero' },
    'hawkeye': { powers: false, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'joker': { powers: false, gender: 'male', species: 'human', fictional: true, alignment: 'villain' },
    'lex luthor': { powers: false, gender: 'male', species: 'human', fictional: true, alignment: 'villain' },
    'darth vader': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'villain' },
    'thanos': { powers: true, gender: 'male', species: 'alien', fictional: true, alignment: 'villain' },
    'harry potter': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'hermione granger': { powers: true, gender: 'female', species: 'human', fictional: true, alignment: 'hero' },
    'voldemort': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'villain' },
    'luke skywalker': { powers: true, gender: 'male', species: 'human', fictional: true, alignment: 'hero' },
    'leia organa': { powers: true, gender: 'female', species: 'human', fictional: true, alignment: 'hero' },
    'sherlock holmes': { powers: false, gender: 'male', species: 'human', fictional: true },
    'frodo baggins': { powers: false, gender: 'male', species: 'hobbit', fictional: true, alignment: 'hero' },
    'gandalf': { powers: true, gender: 'male', species: 'wizard', fictional: true },
    'mickey mouse': { powers: false, gender: 'male', species: 'mouse', fictional: true },
    'donald duck': { powers: false, gender: 'male', species: 'duck', fictional: true },
    
    // Real people (historical figures, politicians, celebrities)
    'abraham lincoln': { powers: false, gender: 'male', species: 'human', fictional: false },
    'george washington': { powers: false, gender: 'male', species: 'human', fictional: false },
    'john f kennedy': { powers: false, gender: 'male', species: 'human', fictional: false },
    'jfk': { powers: false, gender: 'male', species: 'human', fictional: false },
    'winston churchill': { powers: false, gender: 'male', species: 'human', fictional: false },
    'albert einstein': { powers: false, gender: 'male', species: 'human', fictional: false },
    'martin luther king': { powers: false, gender: 'male', species: 'human', fictional: false },
    'nelson mandela': { powers: false, gender: 'male', species: 'human', fictional: false },
    'mahatma gandhi': { powers: false, gender: 'male', species: 'human', fictional: false },
    'leonardo da vinci': { powers: false, gender: 'male', species: 'human', fictional: false },
    'william shakespeare': { powers: false, gender: 'male', species: 'human', fictional: false },
    'cleopatra': { powers: false, gender: 'female', species: 'human', fictional: false },
    'queen elizabeth': { powers: false, gender: 'female', species: 'human', fictional: false },
    'marie curie': { powers: false, gender: 'female', species: 'human', fictional: false },
    'nikola tesla': { powers: false, gender: 'male', species: 'human', fictional: false },
    'elon musk': { powers: false, gender: 'male', species: 'human', fictional: false },
    'steve jobs': { powers: false, gender: 'male', species: 'human', fictional: false },
    'bill gates': { powers: false, gender: 'male', species: 'human', fictional: false },
    'oprah winfrey': { powers: false, gender: 'female', species: 'human', fictional: false },
    'michael jordan': { powers: false, gender: 'male', species: 'human', fictional: false },
    'muhammad ali': { powers: false, gender: 'male', species: 'human', fictional: false },
    'elvis presley': { powers: false, gender: 'male', species: 'human', fictional: false },
    'michael jackson': { powers: false, gender: 'male', species: 'human', fictional: false },
    'beyonce': { powers: false, gender: 'female', species: 'human', fictional: false },
    'taylor swift': { powers: false, gender: 'female', species: 'human', fictional: false },
  }
  
  let charTraits = characterTraits[name]
  
  if (!charTraits) {
    // Unknown character - try web search
    console.info(`[Detective] Character "${guessName}" not in database, searching web...`)
    const webInfo = await searchCharacterInfo(guessName)
    
    if (webInfo) {
      charTraits = webInfo
      console.info(`[Detective] Using web-searched info for "${guessName}"`)
    } else {
      // Still unknown after search - let it through (AI might know obscure characters)
      console.info(`[Detective] Character "${guessName}" unknown even after web search, allowing guess`)
      return true
    }
  }
  
  // Check has_powers compatibility
  if (hasPowers === 'false' || hasPowers === 'no') {
    if (charTraits.powers) {
      console.info(`[Detective] Filtering guess "${guessName}" - has powers but user said no powers`)
      return false
    }
  }
  if (hasPowers === 'true' || hasPowers === 'yes') {
    if (!charTraits.powers) {
      console.info(`[Detective] Filtering guess "${guessName}" - no powers but user said has powers`)
      return false
    }
  }
  
  // Check gender compatibility
  if (gender === 'male' || gender === 'man' || gender === 'boy') {
    if (charTraits.gender !== 'male') {
      console.info(`[Detective] Filtering guess "${guessName}" - wrong gender (expected male)`)
      return false
    }
  }
  if (gender === 'female' || gender === 'woman' || gender === 'girl') {
    if (charTraits.gender !== 'female') {
      console.info(`[Detective] Filtering guess "${guessName}" - wrong gender (expected female)`)
      return false
    }
  }
  
  // Check species compatibility (basic check)
  if (species === 'human' || species === 'person') {
    if (!['human', 'demigod'].includes(charTraits.species)) {
      console.info(`[Detective] Filtering guess "${guessName}" - not human (species: ${charTraits.species})`)
      return false
    }
  }
  
  // Check alignment compatibility
  if (alignment === 'hero') {
    if (charTraits.alignment === 'villain') {
      console.info(`[Detective] Filtering guess "${guessName}" - villain but user said hero`)
      return false
    }
  }
  if (alignment === 'villain') {
    if (charTraits.alignment === 'hero') {
      console.info(`[Detective] Filtering guess "${guessName}" - hero but user said villain`)
      return false
    }
  }
  
  return true
}

// Returns true if newQ is topically too similar to an already-asked question
function isDuplicateTopic(newQ: string, prevQuestions: string[]): boolean {
  const newWords = topicWords(newQ)
  if (newWords.size === 0) return false

  // Normalize questions for exact comparison
  const normalizedNew = newQ.toLowerCase().replace(/[^a-z\s]/g, '').trim()

  for (const prev of prevQuestions) {
    // Check for exact match (ignoring punctuation/case)
    const normalizedPrev = prev.toLowerCase().replace(/[^a-z\s]/g, '').trim()
    if (normalizedNew === normalizedPrev) {
      console.warn('[Detective] Exact duplicate detected:', newQ, '===', prev)
      return true
    }

    const prevWords = topicWords(prev)

    // Count overlapping or semantically related topic words
    let overlap = 0
    const matchedWords: string[] = []
    for (const newWord of newWords) {
      for (const prevWord of prevWords) {
        if (areSemanticallyRelated(newWord, prevWord)) {
          overlap++
          matchedWords.push(`${newWord}~${prevWord}`)
          break
        }
      }
    }

    // Require at least 2 meaningful topic words to match (stricter to avoid false positives)
    // Exception: if questions are very similar (80%+ of words match), consider it a duplicate
    const similarityRatio = overlap / Math.max(newWords.size, prevWords.size)
    if (overlap >= 2 || similarityRatio >= 0.8) {
      console.warn('[Detective] Semantic duplicate detected:', newQ, 'vs', prev, '| matched:', matchedWords, `| ratio: ${(similarityRatio * 100).toFixed(0)}%`)
      return true
    }
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
  'Does your character have any distinctive accessories?',
  'Does your character have facial hair?',
  'Is your character known for a specific catchphrase or saying?',
  'Does your character have a distinctive eye color?',
  'Is your character associated with a specific location or place?',
  'Does your character have a sidekick or companion?',
  'Is your character bald or have a shaved head?',
  'Does your character wear glasses or eyewear?',
  'Is your character known for a specific fighting style?',
  'Does your character have tattoos or body markings?',
  'Is your character royalty or nobility?',
  'Does your character have a specific occupation or job?',
  'Is your character known for being intelligent or clever?',
  'Does your character have a specific weakness or vulnerability?',
  'Is your character associated with a specific element (fire, water, etc.)?',
  // Additional physical traits (31-40)
  'Does your character have long hair?',
  'Does your character have short hair?',
  'Does your character wear a hat or headgear?',
  'Does your character have scars or injuries?',
  'Does your character have a muscular build?',
  'Does your character wear a cape or cloak?',
  'Does your character have wings?',
  'Does your character have a tail?',
  'Does your character have pointed ears?',
  'Does your character have glowing eyes?',
  // Personality and behavior (41-50)
  'Is your character funny or comedic?',
  'Is your character serious or stern?',
  'Is your character brave or courageous?',
  'Is your character mysterious or secretive?',
  'Is your character friendly or outgoing?',
  'Is your character aggressive or violent?',
  'Is your character wise or knowledgeable?',
  'Is your character naive or innocent?',
  'Is your character arrogant or prideful?',
  'Is your character humble or modest?',
  // Background and context (51-60)
  'Is your character from a fantasy setting?',
  'Is your character from a sci-fi setting?',
  'Is your character from ancient times?',
  'Is your character from modern times?',
  'Is your character from the future?',
  'Does your character come from wealth or poverty?',
  'Is your character famous or well-known in their world?',
  'Is your character an orphan?',
  'Does your character have a tragic backstory?',
  'Does your character have family members who are important to the story?',
  // Abilities and skills (61-70)
  'Is your character physically strong?',
  'Is your character fast or agile?',
  'Can your character fly?',
  'Can your character teleport or move instantly?',
  'Can your character read minds or use telepathy?',
  'Can your character control time?',
  'Can your character become invisible?',
  'Is your character immortal or very long-lived?',
  'Can your character heal others?',
  'Does your character have enhanced senses?',
  // Relationships and roles (71-80)
  'Does your character have a romantic partner?',
  'Does your character have a mentor or teacher?',
  'Does your character have a rival or nemesis?',
  'Is your character a leader?',
  'Is your character a loner?',
  'Does your character work with law enforcement?',
  'Is your character a student?',
  'Does your character have children?',
  'Does your character have a pet or animal companion?',
  'Is your character part of a family dynasty?',
]

function pickFallback(prevQuestions: string[], confirmedTraitKeys: Set<string>, traits: Trait[]): string {
  console.info('[Detective] Picking fallback. Already asked:', prevQuestions.length, 'questions')
  
  // Normalize previous questions for comparison
  const normalizedPrevious = prevQuestions.map(q => 
    q.toLowerCase().replace(/[^a-z\s]/g, '').trim()
  )

  for (let i = 0; i < FALLBACK_QUESTIONS.length; i++) {
    const q = FALLBACK_QUESTIONS[i]
    const normalizedQ = q.toLowerCase().replace(/[^a-z\s]/g, '').trim()
    
    // Check for exact duplicate first (fast check)
    if (normalizedPrevious.includes(normalizedQ)) {
      console.info(`[Detective] Skipping fallback #${i + 1} (exact match):`, q)
      continue
    }
    
    const isDup = isDuplicateTopic(q, prevQuestions)
    const isRedundant = isAboutConfirmedTrait(q, confirmedTraitKeys)
    const isIncompatible = isLogicallyIncompatible(q, traits)

    if (!isDup && !isRedundant && !isIncompatible) {
      console.info(`[Detective] Selected fallback #${i + 1}/${FALLBACK_QUESTIONS.length}:`, q)
      return q
    } else {
      const reason = isDup ? 'duplicate' : isRedundant ? 'redundant' : 'incompatible'
      console.info(`[Detective] Skipping fallback #${i + 1} (${reason}):`, q)
    }
  }

  // If all 80 fallbacks exhausted, use extended fallback pool (30 additional questions)
  // These cycle based on turn number to ensure uniqueness
  const turnNum = prevQuestions.length + 1
  const extendedFallbacks = [
    'Does your character use technology or gadgets?',
    'Is your character a scientist or inventor?',
    'Does your character have a secret identity?',
    'Is your character wealthy or rich?',
    'Does your character live in a city?',
    'Is your character from space or another planet?',
    'Does your character wear a mask?',
    'Is your character athletic or sporty?',
    'Does your character have a specific accent or way of speaking?',
    'Is your character religious or spiritual?',
    'Does your character have a disability?',
    'Is your character a parent?',
    'Does your character smoke or drink?',
    'Is your character a criminal?',
    'Does your character have military training?',
    'Is your character a doctor or medic?',
    'Does your character have artistic talents?',
    'Is your character a musician?',
    'Does your character have magical abilities?',
    'Is your character connected to nature or animals?',
    'Does your character have a dual personality?',
    'Is your character from nobility or high society?',
    'Does your character have cybernetic enhancements?',
    'Is your character undead or a ghost?',
    'Does your character have a tragic love story?',
    'Is your character seeking revenge?',
    'Does your character have amnesia or memory loss?',
    'Is your character a shapeshifter?',
    'Does your character have a cursed or blessed item?',
    'Is your character prophesied or destined for something?',
  ]
  
  const fallback = `${extendedFallbacks[(turnNum % extendedFallbacks.length)]} (T${turnNum})`
  console.warn('[Detective] All', FALLBACK_QUESTIONS.length, 'fallbacks exhausted, using extended fallback #' + ((turnNum % extendedFallbacks.length) + 1) + '/30:', fallback)
  return fallback
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
    temperature: 0.1,  // Very low for consistent trait extraction
    max_tokens: 100,   // Optimized: trait extraction is 2-20 tokens, 100 is buffer
  })

  console.info('[Detective] extractTrait full response:', JSON.stringify(response, null, 2))
  const raw = response.choices[0]?.message?.content || ''
  console.info('[Detective] extractTrait raw:', raw)
  const json = extractJSON(raw)

  if (!json) {
    console.warn('[Detective] extractTrait: Failed to extract JSON from response')
    return null
  }

  if (!json.key || !json.value) {
    console.warn('[Detective] extractTrait: Missing key or value in JSON:', json)
    return null
  }

  const value = String(json.value).toLowerCase()
  const badValues = ['unknown', 'unclear', 'n/a', 'none', 'not_applicable', '{}', '']
  if (badValues.includes(value) || value.startsWith('not_') || value.startsWith('non_')) {
    console.warn('[Detective] extractTrait: Invalid value rejected:', value)
    return null
  }

  let key = String(json.key)
  let finalValue = String(json.value)

  const isNegativeAnswer = answer === 'no' || answer === 'probably_not'
  const isPositiveAnswer = answer === 'yes' || answer === 'probably'

  // Client-side fix: "no" to specific-category questions should not create traits
  // These keys can have many possible values, so "no" to one doesn't tell us what it IS
  const specificCategoryKeys = ['origin_medium', 'hair_color', 'eye_color', 'clothing', 'accessories', 'skin_color']
  if (specificCategoryKeys.includes(key) && isNegativeAnswer) {
    console.warn(`[Detective] Rejecting ${key} extraction from "no" answer to specific question`)
    return null
  }

  // Client-side fix: Validate real/fictional logic
  // "Is your character real?" + "no" should give fictional=true (not fictional=false)
  if (key === 'fictional' && question.toLowerCase().includes('real')) {
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

// Binary trait inference: For questions with only 2 possible values,
// "no" to one implies the other (e.g., "no" to human = non-human)
function inferSecondaryTrait(
  question: string,
  answer: AnswerValue,
  primaryTrait: Trait | null,
): Trait | null {
  if (answer === 'dont_know') return null
  
  const isNegativeAnswer = answer === 'no' || answer === 'probably_not'
  const isPositiveAnswer = answer === 'yes' || answer === 'probably'
  
  if (!isNegativeAnswer && !isPositiveAnswer) return null
  
  const questionLower = question.toLowerCase()
  
  // Binary question patterns: [keyword in question] -> [key, positive value, negative value]
  const binaryPatterns: Array<{ keywords: string[], key: string, positiveValue: string, negativeValue: string }> = [
    { keywords: ['human'], key: 'species', positiveValue: 'human', negativeValue: 'non-human' },
    { keywords: ['hero', 'heroic', 'protagonist'], key: 'alignment', positiveValue: 'hero', negativeValue: 'non-hero' },
    { keywords: ['villain', 'antagonist', 'evil'], key: 'alignment', positiveValue: 'villain', negativeValue: 'non-villain' },
    { keywords: ['good', 'good guy'], key: 'morality', positiveValue: 'good', negativeValue: 'not-good' },
    { keywords: ['bad', 'bad guy'], key: 'morality', positiveValue: 'bad', negativeValue: 'not-bad' },
    { keywords: ['adult'], key: 'age_group', positiveValue: 'adult', negativeValue: 'non-adult' },
    { keywords: ['child', 'kid'], key: 'age_group', positiveValue: 'child', negativeValue: 'not-child' },
    { keywords: ['teenager', 'teen'], key: 'age_group', positiveValue: 'teenager', negativeValue: 'not-teenager' },
    { keywords: ['male', 'man', 'boy'], key: 'gender', positiveValue: 'male', negativeValue: 'female' },
    { keywords: ['female', 'woman', 'girl'], key: 'gender', positiveValue: 'female', negativeValue: 'male' },
    { keywords: ['robot', 'robotic', 'android'], key: 'species', positiveValue: 'robot', negativeValue: 'non-robot' },
    { keywords: ['alien', 'extraterrestrial'], key: 'species', positiveValue: 'alien', negativeValue: 'non-alien' },
    { keywords: ['animal', 'creature'], key: 'species', positiveValue: 'animal', negativeValue: 'non-animal' },
  ]
  
  // Check if question matches any binary pattern
  for (const pattern of binaryPatterns) {
    const matchesKeyword = pattern.keywords.some(kw => questionLower.includes(kw))
    if (!matchesKeyword) continue
    
    // If we already extracted this trait from the LLM, don't override it
    if (primaryTrait && primaryTrait.key === pattern.key) {
      console.info(`[SecondaryInference] Primary trait already extracted for ${pattern.key}, skipping`)
      continue
    }
    
    // Infer the value based on answer
    const inferredValue = isPositiveAnswer ? pattern.positiveValue : pattern.negativeValue
    
    // Don't create traits with negative values (not-X, non-X)
    if (inferredValue.startsWith('not-') || inferredValue.startsWith('non-')) {
      console.info(`[SecondaryInference] Skipping negative value: ${inferredValue}`)
      continue
    }
    
    console.info(`[SecondaryInference] Inferred from "${question}" + "${answer}": ${pattern.key} = ${inferredValue}`)
    
    return {
      key: pattern.key,
      value: inferredValue,
      confidence: 0.85, // High confidence for binary inference
      turnAdded: 0,
    }
  }
  
  return null
}

// Call 2: Ask the next question given all confirmed traits and history
async function askNextQuestion(
  traits: Trait[],
  turns: Array<{ question: string; answer: AnswerValue }>,
  rejectedGuesses: string[],
): Promise<{ question: string; topGuesses: Guess[] }> {
  const prevQuestions = turns.map(t => t.question)
  
  // Build comprehensive context - SEND EVERYTHING, never truncate
  const parts: string[] = []

  // Always include full trait list with detailed information
  if (traits.length > 0) {
    const confirmedKeys = Array.from(new Set(traits.map(t => t.key))).join(', ')
    const traitLines = traits.map(t => `  ${t.key} = ${t.value} (confidence: ${Math.round(t.confidence * 100)}%, turn ${t.turnAdded})`).join('\n')
    
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
    
    // Add logical incompatibility warnings based on trait values
    const species = traits.find(t => t.key === 'species')?.value?.toLowerCase()
    const hasPowers = traits.find(t => t.key === 'has_powers')?.value?.toLowerCase()
    const fictional = traits.find(t => t.key === 'fictional')?.value?.toLowerCase()
    
    if (species === 'human' || species === 'person' || species === 'mortal') {
      warnings.push('  🚫 Character is HUMAN - DO NOT ask about wings, tail, scales, pointed ears, horns, claws, or other non-human features')
    }
    if (hasPowers === 'false' || hasPowers === 'no') {
      warnings.push('  🚫 Character has NO POWERS - DO NOT ask about flight, teleportation, telepathy, super strength, or other superpowers')
    }
    if (fictional === 'false' || fictional === 'no' || fictional === 'real') {
      warnings.push('  🚫 Character is REAL - DO NOT ask about magic, supernatural abilities, vampires, dragons, or fantasy creatures')
    }
    
    const warningText = warnings.length > 0 ? '\n' + warnings.join('\n') : ''
    parts.push(`Confirmed traits (NEVER ask about these trait keys again: ${confirmedKeys}):\n${traitLines}${warningText}`)
  } else {
    parts.push('Confirmed traits: none yet')
  }

  // FULL Q&A HISTORY - never truncate, always send everything
  if (prevQuestions.length > 0) {
    const qaHistory = turns.map((t, i) => `  ${i + 1}. Q: "${t.question}" A: ${ANSWER_LABELS[t.answer]}`).join('\n')
    parts.push(`Questions already asked with answers (STRICTLY FORBIDDEN to repeat any of these topics):\n${qaHistory}`)
  }

  // SESSION LEARNING - inject knowledge gained during this game
  if (sessionLearning.rejectedCharacters.length > 0) {
    const learningLines: string[] = []
    learningLines.push('📚 LEARNED FROM WRONG GUESSES (avoid these patterns):')
    
    for (const rejected of sessionLearning.rejectedCharacters) {
      const traitSummary = rejected.traitsWhenGuessed
        .map(t => `${t.key}=${t.value}`)
        .join(', ')
      learningLines.push(`  ❌ ${rejected.name} was guessed at turn ${rejected.turnRejected} with traits: ${traitSummary}`)
      learningLines.push(`     → ${rejected.name} does NOT match these traits! Avoid similar characters.`)
    }
    
    parts.push(learningLines.join('\n'))
  }
  
  if (sessionLearning.ambiguousQuestions.length > 0) {
    const ambiguousLines: string[] = []
    ambiguousLines.push('⚠️ AMBIGUOUS QUESTIONS (user answered "don\'t know" - avoid similar phrasing):')
    
    for (const ambiguous of sessionLearning.ambiguousQuestions) {
      ambiguousLines.push(`  Turn ${ambiguous.turn}: "${ambiguous.question}"`)
    }
    
    parts.push(ambiguousLines.join('\n'))
  }

  if (rejectedGuesses.length > 0) {
    parts.push(`Rejected guesses (never guess these): ${rejectedGuesses.join(', ')}`)
  }

  parts.push(`Turn: ${turns.length + 1}. Ask ONE NEW yes/no question exploring a completely different topic. Return JSON only, no explanation.`)

  console.info('[Detective] Sending FULL context to AI - traits:', traits.length, ', questions:', prevQuestions.length, ', rejected guesses:', rejectedGuesses.length)

  const response = await chatCompletion({
    model: DETECTIVE_MODEL,
    messages: [
      { role: 'system', content: DETECTIVE_SYSTEM_PROMPT },
      { role: 'user', content: parts.join('\n\n') },
    ],
    temperature: 0.2,  // Very low for more deterministic outputs
    max_tokens: 150,   // Optimized: questions are only 20-40 tokens, 150 allows reasoning buffer
  })

  console.info('[Detective] askNextQuestion full response:', JSON.stringify(response, null, 2))
  const raw = response.choices[0]?.message?.content || ''
  console.info('[Detective] askNextQuestion raw:', raw)
  const json = extractJSON(raw)

  if (!json) {
    console.warn('[Detective] askNextQuestion: Failed to extract JSON, using fallback')
  }

  let question: string = json?.question ? String(json.question) : ''

  // Fix "or" questions
  if (question.toLowerCase().includes(' or ')) {
    question = question.replace(/\s+or\s+[^?]*/i, '')
    if (!question.endsWith('?')) question += '?'
  }

  // Hard block on forbidden patterns (overly specific questions)
  const hasForbiddenPattern = FORBIDDEN_PATTERNS.some(pattern => pattern.test(question))
  if (hasForbiddenPattern) {
    console.warn(`[Detective] FORBIDDEN PATTERN detected in question: "${question}"`)
    console.warn('[Detective] This question is too specific (background/history/experience/career), forcing fallback')
    const fallback = pickFallback(prevQuestions, new Set(traits.map(t => t.key)), traits)
    console.info('[Detective] Selected fallback after pattern rejection:', fallback)
    question = fallback
  }

  // Client-side duplicate check — fall back to a structured question if the model repeated
  const confirmedTraitKeys = new Set(traits.map(t => t.key))
  
  const isEmpty = !question
  const isDupe = question && isDuplicateTopic(question, prevQuestions)
  const isRedundant = question && isAboutConfirmedTrait(question, confirmedTraitKeys)
  const isIncompatible = question && isLogicallyIncompatible(question, traits)
  const isInExploredRealm = question && isInAlreadyExploredRealm(question, prevQuestions)
  
  if (isEmpty || isDupe || isRedundant || isIncompatible || isInExploredRealm) {
    const reason = isEmpty ? 'empty' 
      : isDupe ? 'duplicate topic' 
      : isRedundant ? 'redundant trait' 
      : isIncompatible ? 'logically incompatible'
      : 'already explored realm'
    console.warn(`[Detective] ${reason} question detected: "${question}", using fallback`)
    
    const fallback = pickFallback(prevQuestions, confirmedTraitKeys, traits)
    console.info('[Detective] Selected fallback:', fallback)
    question = fallback
  }

  // Filter top guesses - need to handle async validation
  let topGuesses: Guess[] = []
  if (Array.isArray(json?.top_guesses)) {
    const candidates = (json.top_guesses as any[])
      .filter(g => g.name && typeof g.confidence === 'number')
      .filter(g => !rejectedGuesses.some(r => r.toLowerCase() === String(g.name).toLowerCase()))
    
    // Validate each guess asynchronously (with web search if needed)
    const validationResults = await Promise.all(
      candidates.map(async (g) => {
        const isCompatible = await isGuessCompatible(String(g.name), traits)
        return { guess: g, isCompatible }
      })
    )
    
    topGuesses = validationResults
      .filter(result => result.isCompatible)
      .map(result => ({
        name: String(result.guess.name),
        confidence: Math.min(Math.max(Number(result.guess.confidence), 0.01), 0.99),
      }))
  }

  return { question, topGuesses }
}

export async function askDetective(
  traits: Trait[],
  turns: Array<{ question: string; answer: AnswerValue }>,
  turnNumber: number,
  rejectedGuesses: string[] = [],
): Promise<{ question: string; newTraits: Trait[]; topGuesses: Guess[] }> {
  const lastTurn = turns[turns.length - 1]

  // Step 1: extract primary trait from last answered question
  const primaryTrait = lastTurn ? await extractTrait(lastTurn.question, lastTurn.answer) : null
  
  // Step 1.5: try secondary inference for binary questions
  const secondaryTrait = lastTurn ? inferSecondaryTrait(lastTurn.question, lastTurn.answer, primaryTrait) : null
  
  // Collect all new traits (both primary from LLM and secondary from inference)
  const newTraits: Trait[] = []
  if (primaryTrait) {
    newTraits.push({ ...primaryTrait, turnAdded: turnNumber })
  }
  if (secondaryTrait) {
    // Only add if we don't already have this key
    const alreadyHaveKey = traits.some(t => t.key === secondaryTrait.key) || 
                           newTraits.some(t => t.key === secondaryTrait.key)
    if (!alreadyHaveKey) {
      newTraits.push({ ...secondaryTrait, turnAdded: turnNumber })
      console.info('[Detective] Added secondary inferred trait:', secondaryTrait.key, '=', secondaryTrait.value)
    }
  }

  console.info('[Detective] newTraits:', newTraits, '| all traits:', [...traits, ...newTraits])

  // Step 2: ask next question with updated trait list so model avoids confirmed topics
  const updatedTraits = [...traits]
  for (const newTrait of newTraits) {
    // Remove old trait with same key, add new one
    const filtered = updatedTraits.filter(t => t.key !== newTrait.key)
    filtered.push({ ...newTrait, turnAdded: turnNumber })
    updatedTraits.length = 0
    updatedTraits.push(...filtered)
  }

  const { question, topGuesses } = await askNextQuestion(updatedTraits, turns, rejectedGuesses)

  console.info('[Detective] question:', question, '| topGuesses:', topGuesses)

  return { question, newTraits, topGuesses }
}
