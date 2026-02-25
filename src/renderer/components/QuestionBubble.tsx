import { useGameState } from '../context/GameContext'
import { useEffect } from 'react'

interface Props {
  isSpeaking: boolean
  spokenText: string | null
}

export default function QuestionBubble({ isSpeaking, spokenText }: Props) {
  const { currentQuestion, phase, turn } = useGameState()

  // Log questions as they're displayed
  useEffect(() => {
    if (currentQuestion && phase === 'waiting_for_answer') {
      // Check if it's a character guess question
      const isCharacterGuess = /^Is your character .+\?$/i.test(currentQuestion) &&
                               !currentQuestion.toLowerCase().includes('from') &&
                               !currentQuestion.toLowerCase().includes('known for') &&
                               !currentQuestion.toLowerCase().includes('an actor') &&
                               !currentQuestion.toLowerCase().includes('an athlete')

      if (isCharacterGuess) {
        console.log(`[UI] 🎲 Turn ${turn}: GUESSING - ${currentQuestion}`)
      } else {
        console.log(`[UI] ❓ Turn ${turn}: ASKING - ${currentQuestion}`)
      }
    }
  }, [currentQuestion, phase, turn])

  // Determine what to display:
  // 1. If voice is speaking, show what it's saying (reaction, commentary, question, etc.)
  // 2. If waiting for answer and voice is done, show the current question
  // 3. Otherwise show nothing
  let displayText: string | null = null
  let isVoiceOnly = false

  if (isSpeaking && spokenText) {
    displayText = spokenText
    // Mark as voice-only text when it's NOT the current question (e.g., reaction or commentary)
    isVoiceOnly = spokenText !== currentQuestion
  } else if (phase === 'waiting_for_answer' && currentQuestion) {
    displayText = currentQuestion
  }

  return (
    <div className="question-bubble-container">
      {displayText && (
        <div className={`question-bubble${isVoiceOnly ? ' voice-only' : ''}`}>
          <div className="question-bubble-avatar">🍋</div>
          <div className="question-bubble-text">{displayText}</div>
        </div>
      )}
    </div>
  )
}
