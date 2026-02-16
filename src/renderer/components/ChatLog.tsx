import { useRef, useEffect } from 'react'
import { useGameState } from '../context/GameContext'

export default function ChatLog() {
  const { turns, currentQuestion, phase, guessAttempts } = useGameState()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length, currentQuestion])

  return (
    <div className="chatlog">
      <h3 className="chatlog-title">Investigation Log</h3>
      <div className="chatlog-messages">
        {turns.map((t, i) => {
          // Find any guess attempts made after this turn
          const guessesAfterTurn = guessAttempts.filter(g => g.turnNumber === t.turnNumber)
          
          return (
            <div key={i}>
              <div className="chatlog-turn">
                <div className="chatlog-question">
                  <span className="chatlog-label">Q{t.turnNumber}:</span> {t.question}
                </div>
                <div className="chatlog-answer">
                  <span className="chatlog-label">A:</span>{' '}
                  <span className={`answer-tag answer-${t.answer}`}>
                    {t.answer.replace('_', ' ')}
                  </span>
                </div>
                {t.topGuesses && t.topGuesses.length > 0 && (
                  <div className="chatlog-guesses">
                    <span className="chatlog-label">Top guesses:</span>{' '}
                    {t.topGuesses.map((g, idx) => (
                      <span key={idx} className="guess-item">
                        {g.name} ({Math.round(g.confidence * 100)}%)
                        {idx < t.topGuesses.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {guessesAfterTurn.map((attempt, idx) => (
                <div key={`guess-${i}-${idx}`} className="chatlog-guess-attempt">
                  <span className="chatlog-label">Guess:</span>{' '}
                  <strong>{attempt.guess}</strong> —{' '}
                  <span className={attempt.correct ? 'guess-correct' : 'guess-incorrect'}>
                    {attempt.correct ? '✓ Correct!' : '✗ Incorrect'}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
        {currentQuestion && phase === 'waiting_for_answer' && (
          <div className="chatlog-turn chatlog-current">
            <div className="chatlog-question">
              <span className="chatlog-label">Q{turns.length + 1}:</span> {currentQuestion}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
