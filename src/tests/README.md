# Automated Integration Tests

This directory contains automated testing infrastructure for the Detective AI.

## Overview

The integration tests simulate actual gameplay by:
1. Randomly selecting characters from the knowledge base
2. Letting the Detective ask questions
3. Simulating answers based on the character's actual traits
4. Tracking performance metrics (accuracy, turns to guess, etc.)

## Running Tests

### Quick Test (10 games)
```bash
npm run test:quick
```

### Full Test Suite (50 games)
```bash
npm run test:full
```

### Test Specific Category
```bash
npm run test:category=actors --games=20
npm run test:category=superheroes --games=15
```

### Custom Options
```bash
npm run test:integration -- --games=30 --max-turns=20 --verbose
```

Available options:
- `--games=N`: Number of games to run (default: 10)
- `--category=CAT`: Filter to specific category (actors, athletes, musicians, etc.)
- `--max-turns=N`: Maximum turns per game (default: 25)
- `--verbose` or `-v`: Show detailed game-by-game output

## Output

### Console Output
```
============================================================
DETECTIVE AI PERFORMANCE METRICS
============================================================

Total Games: 50
Success Rate: 86.0%
Average Turns to Guess: 8.4

Guess Distribution:
  First Guess (Rank 1):  28 (56.0%)
  Second Guess (Rank 2): 10 (20.0%)
  Third Guess (Rank 3):  5 (10.0%)
  Not in Top 3:          7 (14.0%)

Performance by Category:
  actors          12 games, 92% success, 7.8 avg turns
  athletes        10 games, 80% success, 9.2 avg turns
  musicians       9 games, 89% success, 8.1 avg turns
  superheroes     8 games, 100% success, 6.5 avg turns
  ...

Hardest Characters (most turns):
   1. John Smith                   15 turns
   2. Jane Doe                     14 turns
   ...
```

### JSON Results File
Detailed results are saved to `test-results-[timestamp].json` in the project root:

```json
{
  "timestamp": "2026-02-15T22:00:00.000Z",
  "options": {
    "numGames": 50,
    "maxTurns": 25
  },
  "metrics": { ... },
  "results": [
    {
      "characterName": "Batman",
      "category": "superheroes",
      "success": true,
      "turnsToGuess": 7,
      "correctGuessRank": 1,
      "traits": [...],
      "questionHistory": [...]
    }
  ]
}
```

## Metrics Explained

### Success Rate
Percentage of games where the correct character appeared in the final guess list.

### Average Turns
Average number of questions asked before making a successful guess.

### Guess Distribution
Shows how often the correct character appears in:
- Rank 1 (first guess) - highest priority
- Rank 2 (second guess)
- Rank 3 (third guess)
- Not in Top 3 - needs improvement

### Category Performance
Breakdown by character category showing:
- Number of games played
- Success rate for that category
- Average turns for successful guesses

### Hardest Characters
Characters that required the most turns to guess correctly. Useful for identifying:
- Characters with ambiguous traits
- Categories needing more strategic questions
- Edge cases in the knowledge base

## Using Tests for Development

### 1. Baseline Performance
Run a full test before making changes:
```bash
npm run test:full > baseline-results.txt
```

### 2. Make Changes
Improve the detective logic, add questions, tune confidence scoring, etc.

### 3. Regression Test
Run tests again and compare:
```bash
npm run test:full > new-results.txt
diff baseline-results.txt new-results.txt
```

### 4. Category-Specific Testing
If improving actor detection:
```bash
npm run test:integration -- --category=actors --games=30 --verbose
```

### 5. Identify Problem Areas
Look at "Hardest Characters" to find:
- Characters with incomplete data
- Categories needing better questions
- Ambiguous trait combinations

## Simulated Answer Logic

The `simulateAnswer()` function in `automated-gameplay.ts` simulates how a player would answer based on character data:

- **Exact matches**: Questions about category, gender, fictional status
- **Fact searching**: Questions about nationality, genre, life status
- **Heuristics**: Broad questions use educated guesses based on category
- **Default**: Keyword matching in distinctive facts

This isn't perfect (simulates an ideal player), but provides consistent testing.

## Future Enhancements

Potential improvements:
- [ ] Add "noisy" answering (occasional wrong/ambiguous answers)
- [ ] Test with user-provided characters (not in database)
- [ ] Performance over time tracking
- [ ] A/B testing different models
- [ ] Parallel test execution
- [ ] CI/CD integration

## Troubleshooting

### Tests Failing to Run
Make sure you've built the project first:
```bash
npm run build
npm run test:quick
```

### Low Success Rates
- Check if Lemonade server is running
- Verify model is loaded (Qwen3-4B-Instruct-2507-GGUF)
- Increase max turns: `--max-turns=30`

### Timeout Issues
The tests make real LLM calls, so they can be slow:
- Each game: ~30-60 seconds
- 50 games: ~30-45 minutes
- Run smaller batches or use `--max-turns=15` for faster testing
