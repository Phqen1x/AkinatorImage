#!/bin/bash
# Auto-iteration script: Run tests, analyze, commit findings
# Usage: ./auto-iterate.sh [iterations] [max_minutes]

ITERATIONS=${1:-10}
MAX_MINUTES=${2:-60}
START_TIME=$(date +%s)

echo "============================================================"
echo "AUTO-ITERATION MODE"
echo "============================================================"
echo "Max iterations: $ITERATIONS"
echo "Max time: $MAX_MINUTES minutes"
echo "Start time: $(date)"
echo "============================================================"
echo ""

for i in $(seq 1 $ITERATIONS); do
  # Check time limit
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((($CURRENT_TIME - $START_TIME) / 60))
  
  if [ $ELAPSED -ge $MAX_MINUTES ]; then
    echo ""
    echo "⏱️  Time limit reached ($MAX_MINUTES minutes)"
    echo "Completed $((i-1)) iterations"
    break
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "ITERATION $i / $ITERATIONS (Elapsed: ${ELAPSED}m / ${MAX_MINUTES}m)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Run tests
  echo "▶️  Running 5-game test suite..."
  npm run test:quick
  TEST_EXIT=$?
  
  if [ $TEST_EXIT -ne 0 ]; then
    echo "❌ Tests failed with exit code $TEST_EXIT"
  fi
  
  # Find latest results file
  LATEST_RESULTS=$(ls -t test-results-*.json 2>/dev/null | head -1)
  
  if [ -z "$LATEST_RESULTS" ]; then
    echo "⚠️  No results file found"
    continue
  fi
  
  echo ""
  echo "📊 Results: $LATEST_RESULTS"
  
  # Extract key metrics using node
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$LATEST_RESULTS', 'utf8'));
    console.log('');
    console.log('Success Rate: ' + (data.successRate * 100).toFixed(1) + '%');
    console.log('Avg Turns: ' + data.averageTurns.toFixed(1));
    console.log('Successful: ' + data.successful.length + ' / ' + data.totalGames);
    if (data.failed.length > 0) {
      console.log('');
      console.log('Failed characters:');
      data.failed.forEach(f => {
        console.log('  - ' + f.character + ' (' + f.category + ') - ' + f.turns + ' turns');
      });
    }
  "
  
  echo ""
  echo "Iteration $i complete at $(date +%H:%M:%S)"
  
  # Small delay between iterations
  sleep 2
done

echo ""
echo "============================================================"
echo "AUTO-ITERATION COMPLETE"
echo "============================================================"
FINAL_TIME=$(date +%s)
TOTAL_ELAPSED=$((($FINAL_TIME - $START_TIME) / 60))
echo "Total time: ${TOTAL_ELAPSED} minutes"
echo "End time: $(date)"
echo "============================================================"
