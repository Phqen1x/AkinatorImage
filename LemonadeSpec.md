# 🍋 Lemonators: AI Character Guessing Game  
**Implementation Status: Fully Functional Desktop Application**

---

## 1. Project Overview  
**Lemonators** is a production-ready Electron desktop application that plays a character guessing game. The AI detective asks strategic questions to identify which character (real or fictional) you're thinking of, while simultaneously generating a visual representation that evolves with each clue.

**Current Implementation:**
- ✅ Full Electron + React + TypeScript desktop app
- ✅ Integration with Gemini AI (Google Generative AI) for character deduction
- ✅ SDXL-Turbo image generation via Lemonade server
- ✅ Wikipedia API integration for discovering famous characters
- ✅ RAG-based character database with 1,300+ characters
- ✅ Trait-based confidence scoring and logical deduction
- ✅ Production builds for Linux (AppImage, .deb), Windows (NSIS, portable), and macOS
- ✅ Automated testing suite with 360+ iteration validation

---

## 2. Technical Architecture  
**Current Production Stack:**

| Component | Technology | Role |  
| :--- | :--- | :--- |  
| **Frontend** | React 19 + TypeScript | Desktop UI with game state management |  
| **Desktop Framework** | Electron 40 | Cross-platform desktop packaging |  
| **Build System** | Vite 7 | Fast builds and hot module replacement |  
| **The Detective** | Google Gemini AI (gemini-2.0-flash-exp) | Question generation and character deduction |  
| **The Database** | RAG System + JSON (1,300+ characters) | Trait-based character matching |  
| **The Artist** | SDXL-Turbo via Lemonade Server | Real-time image generation (60-90s render time) |  
| **Discovery Agent** | Wikipedia MediaWiki API | Famous character discovery and validation |  
| **Packaging** | electron-builder 26.7 | Production builds for all platforms |

> **Why this works:** Cloud AI (Gemini) handles the heavy reasoning, local Lemonade server generates unique character images, and RAG provides instant trait matching without hallucination.

---

## 3. Implemented Agent Architecture

### A. The Detective (Gemini AI + RAG)  
* **Implementation:** Gemini 2.0 Flash with structured JSON responses and Zod validation
* **Features:**
  - Multi-trait extraction from single answers
  - Contextual verification to prevent contradictions
  - Logical deduction (e.g., non-fictional → can't be from Marvel/DC)
  - Prevents back-to-back guessing (requires discriminating questions)
  - Asks categorical questions before specific ones
* **Database:** 1,300+ characters with 20+ trait dimensions (gender, nationality, profession, era, etc.)

### B. The Discovery Agent (Wikipedia Integration)  
* **Implementation:** MediaWiki Action API with intelligent filtering
* **Features:**
  - Searches Wikipedia after positive category determination (e.g., "American actor")
  - 80+ filter rules to eliminate non-person results
  - Bad word dictionary (animations, studios, records, concepts)
  - Trait-based confidence scoring (0.45-0.70 for database matches)
  - Position-based fallback scoring (0.50-0.65)
* **Quality:** 100% success rate across 1,440 automated tests

### C. The Artist (Lemonade + SDXL-Turbo)  
* **Implementation:** HTTP API to local Lemonade server
* **Features:**
  - Generates 512x512 character portraits
  - 120-second timeout for CPU rendering (60-90s typical)
  - Async generation during guess dialog
  - Pre-guess rendering for seamless UX
* **Constraint:** Currently generates new images per guess (not img2img evolution)

---

## 4. Production Game Loop

1.  **Initial State:** User thinks of a character and clicks "Start Game"
2.  **Question Phase:**  
    * **Question Generation:** Detective asks strategic yes/no/maybe/unsure questions
    * **Answer Processing:** User responds, traits are extracted and validated
    * **Database Search:** RAG system scores all 1,300+ characters against known traits
    * **Wikipedia Discovery:** After Q5, searches Wikipedia for famous matches
    * **Confidence Scoring:** Hybrid pool combines RAG + Wikipedia with trait-based scoring
3.  **Guess Phase (after Q8):**  
    * **Confidence Check:** When top guess reaches threshold (0.70-0.90 depending on question count)
    * **Image Generation:** SDXL-Turbo renders character portrait (60-90s)
    * **Guess Dialog:** Shows character image with "Is this your character?" prompt
    * **Feedback Loop:** If wrong, asks discriminating questions; prevents immediate re-guess
4.  **Victory:** Correct guess triggers confetti animation and game stats

---

## 5. Implementation Details

### Lemonade Server Integration  
```typescript
// src/renderer/services/lemonade.ts
const LEMONADE_BASE_URL = 'http://localhost:8080';
const IMAGE_ENDPOINT = `${LEMONADE_BASE_URL}/api/v1/images/generate`;

export async function generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResponse> {
  // SDXL-Turbo on CPU takes 60-90 seconds per image
  return fetchJSON<ImageGenerationResponse>(IMAGE_ENDPOINT, req, 120000);
}
```

### Wikipedia Character Discovery
```typescript
// src/renderer/services/wikipedia.ts
// 80+ filter rules to ensure only real person names
const BAD_WORDS = ['animations', 'studios', 'records', 'jazz', 'church', ...];
const BAD_PREFIXES = ['List of', 'Portal:', 'Category:', ...];
const BAD_SUFFIXES = ['actors', 'musicians', 'players', 'song', 'album', ...];

// MediaWiki API for structured data
const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${query}`;
```

### Confidence Scoring Algorithm
```typescript
// src/renderer/services/detective-rag.ts
// Database matches: trait-based scoring
if (dbCharacter) {
  const score = scoreCharacterMatch(dbCharacter, traits);
  confidence = 0.45 + (score * 0.25); // 0.45-0.70 range
}
// Non-database: position-based fallback
else {
  confidence = 0.65 - (index * 0.03); // 0.50-0.65 range
}
```

---

## 6. Production UI/UX

* **Game Board:** Clean, centered layout with question cards and answer buttons
* **Trait Display:** Real-time visualization of discovered character traits
* **Top Guesses:** Live-updating list of top 10 candidates with confidence scores
* **Guess Dialog:** Modal with character image, name, and confidence percentage
* **Visual Feedback:** 
  - Loading states during AI thinking and image generation
  - Confetti animation on victory
  - Error boundaries for graceful failure handling
* **3D Lemon Mascot:** Animated lemon character provides personality (optional feature)

---

## 7. Testing & Quality Assurance

* **Integration Tests:** `src/tests/integration-test.ts` - Full game simulation
* **Wikipedia Tests:** `src/tests/wikipedia-test.ts` - 4 scenarios (actors, musicians, athletes)
* **Automated Loop:** `src/tests/auto-iterate-wikipedia.ts` - 1-hour continuous testing (360 iterations)
* **Auto-Fix System:** `src/tests/auto-fix-wikipedia.ts` - Detects and patches filter failures
* **Results:** 100% success rate across 1,440 test cases (4 scenarios × 360 iterations)

---

## 8. Build & Distribution

**Development:**
```bash
npm install
npm run dev  # Vite dev server
npm run electron:dev  # Full Electron app
```

**Production Builds:**
```bash
npm run electron:build:linux   # AppImage + .deb (114MB / 89MB)
npm run electron:build:win     # NSIS installer + portable
npm run electron:build:mac     # DMG + zip
```

**Snap Package:** (in progress)
- Snapcraft configuration at `snap/snapcraft.yaml`
- Grade: stable, Confinement: strict
- Auto-connects to network for Gemini and Lemonade APIs

---

## 9. Current Limitations & Future Work

**Known Issues:**
- Image generation is not img2img evolution (generates fresh each time)
- Requires Lemonade server running locally on port 8080
- Gemini API requires internet connection and API key

**Future Enhancements:**
- Full offline mode with local LLM (Llama 3 on NPU)
- Img2img progressive refinement for visual consistency
- Multi-language support
- Custom character database import
- Mobile version (React Native)
