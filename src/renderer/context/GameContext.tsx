import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react'
import type { GameState, GameAction, Trait } from '../types/game'

const initialState: GameState = {
  phase: 'idle',
  turn: 0,
  traits: [],
  turns: [],
  currentQuestion: null,
  topGuesses: [],
  rejectedGuesses: [],
  guessAttempts: [],
  currentImageUrl: null,
  seed: Math.floor(Math.random() * 2147483647),
  finalGuess: null,
  error: null,
  isProcessing: false,
}

function mergeTraits(existing: Trait[], incoming: Trait[]): Trait[] {
  const merged = [...existing]
  for (const trait of incoming) {
    // For category and origin_medium traits, we need to accumulate multiple values
    // (e.g., "actors", "NOT_musicians", "NOT_anime", "NOT_video-game")
    // For other traits (like gender, fictional), we overwrite since they're single-valued
    if (trait.key === 'category' || trait.key === 'origin_medium') {
      // Check if this exact key+value combination already exists
      const exists = merged.some(t => t.key === trait.key && t.value === trait.value)
      if (!exists) {
        merged.push(trait)  // Accumulate multi-value traits
      }
    } else {
      // For single-value traits, overwrite existing trait with same key
      const idx = merged.findIndex(t => t.key === trait.key)
      if (idx >= 0) {
        merged[idx] = trait
      } else {
        merged.push(trait)
      }
    }
  }
  return merged
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return {
        ...initialState,
        phase: 'processing',
        seed: Math.floor(Math.random() * 2147483647),
        isProcessing: true,
      }

    case 'SET_QUESTION':
      // Detective returned a new question — show it, advance turn, merge traits
      // Turn number is incremented HERE (when question is set), so turnNumber reflects
      // the turn number when this question is being asked
      return {
        ...state,
        phase: 'waiting_for_answer',
        turn: state.turn + 1,
        currentQuestion: action.question,
        topGuesses: action.guesses,
        traits: mergeTraits(state.traits, action.traits),
        isProcessing: false,
      }

    case 'SUBMIT_ANSWER':
      // Record the completed Q&A turn, then go to processing
      // Note: turnNumber is state.turn (BEFORE increment), which was set when SET_QUESTION ran
      // So if SET_QUESTION set turn=5, this records turnNumber=5 for that Q&A pair
      const newTurn = {
        turnNumber: state.turn,
        question: state.currentQuestion || '',
        answer: action.answer,
        newTraits: [],  // Will be populated when SET_QUESTION is dispatched with new traits
        topGuesses: state.topGuesses,
        imageUrl: state.currentImageUrl,
      }
      
      return {
        ...state,
        phase: 'processing',
        isProcessing: true,
        turns: [...state.turns, newTurn],
      }

    case 'UPDATE_IMAGE':
      // Background image gen completed
      return {
        ...state,
        currentImageUrl: action.imageUrl,
      }

    case 'MAKE_GUESS':
      return {
        ...state,
        phase: 'guessing',
        finalGuess: action.guess,
        isProcessing: false,
      }

    case 'CONFIRM_GUESS':
      // Guess is associated with the last completed turn
      const lastTurn = state.turns.length > 0 ? state.turns[state.turns.length - 1].turnNumber : state.turn
      if (action.correct) {
        return { 
          ...state, 
          phase: 'revealed', 
          isProcessing: true,
          guessAttempts: [
            ...state.guessAttempts,
            {
              guess: state.finalGuess || '',
              correct: true,
              turnNumber: lastTurn,
            },
          ],
        }
      }
      return {
        ...state,
        phase: 'processing',
        isProcessing: true,
        rejectedGuesses: state.finalGuess
          ? [...state.rejectedGuesses, state.finalGuess]
          : state.rejectedGuesses,
        guessAttempts: [
          ...state.guessAttempts,
          {
            guess: state.finalGuess || '',
            correct: false,
            turnNumber: lastTurn,
          },
        ],
      }

    case 'HERO_RENDER_COMPLETE':
      return {
        ...state,
        phase: 'hero_render',
        currentImageUrl: action.imageUrl,
        isProcessing: false,
      }

    case 'SET_ERROR':
      return { ...state, error: action.error, isProcessing: false }

    case 'CLEAR_ERROR':
      return { ...state, error: null }

    case 'RESET':
      return initialState

    default:
      return state
  }
}

const GameContext = createContext<GameState>(initialState)
const GameDispatchContext = createContext<Dispatch<GameAction>>(() => {})

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  return (
    <GameContext.Provider value={state}>
      <GameDispatchContext.Provider value={dispatch}>
        {children}
      </GameDispatchContext.Provider>
    </GameContext.Provider>
  )
}

export function useGameState() {
  return useContext(GameContext)
}

export function useGameDispatch() {
  return useContext(GameDispatchContext)
}
