# Future Features

This document outlines high-value features to be implemented in the Coffee Roasting Tracker.

## 1. Roasted Weight & Weight Loss Percentage (Yield)

Tracking the weight loss during a roast (typically between 12-20%) is a fundamental metric for roasters. It helps ensure batch-to-batch consistency and gives insight into moisture loss and roast development.

### Implementation Plan:
1. **Data Model Updates (`js/storage.js`):**
   - The `roast` object needs a new property `roastedWeightG`.
2. **UI Updates - History List (`js/history.js`):**
   - **Roast Card (`renderHistoryList`):** Add an "Edit Yield" or "Log Roasted Weight" button to the roast card in the history view. We shouldn't ask for it in the Active Roast tab because beans need to cool down before weighing.
   - **Display:** In the roast card, display the `Roasted Weight: {weight} g` and `Yield / Weight Loss: {percentage}%` if `roastedWeightG` exists. The formula for weight loss is `((greenWeightG - roastedWeightG) / greenWeightG) * 100`.
   - **Modal UI:** Create a simple prompt or modal to input `roastedWeightG`. Upon saving, update the roast object using `updateRoastInHistory`.
3. **UI Updates - Comparison (`js/history.js`):**
   - Update `buildComparisonTable` to include rows for "Roasted Weight" and "Weight Loss %".
4. **Export Updates (`js/history.js`):**
   - Update `exportRoast` (clipboard text) and `exportRoastCsv` to include the `roastedWeightG` and calculated yield percentage.

## 2. SCA-style Cupping Score & Brew Log

Currently, tasting notes are limited to a flavor wheel and free text. Adding a structured, quantitative evaluation system and a brew log allows testers to objectively grade, compare, and reproduce optimal roasts.

### Implementation Plan:
1. **Data Model Updates (`js/storage.js`):**
   - Update the `tastingNotes` object within a roast to include:
     - `scores`: An object with SCA parameters (e.g., `aroma`, `acidity`, `body`, `flavor`, `aftertaste`, `sweetness`, `balance`, `overall`), each rated out of 10, plus an overall score out of 100.
     - `brewLog`: An object detailing the brew method (e.g., `method`, `doseGrams`, `yieldGrams`, `temperatureUnit`, `temperature`, `grindSize`).
2. **UI Updates - Tasting Notes Modal (`js/history.js` -> `openTastingModal`):**
   - **Tabs or Sections:** Split the modal into "Flavors", "Cupping Scores", and "Brew Parameters".
   - **Cupping Scores Section:** Add number inputs or sliders (0-10, with 0.25 increments) for each SCA parameter. Automatically calculate the total score (out of 100).
   - **Brew Parameters Section:** Add inputs for the brew method (dropdown), dose, yield/water weight, and grind setting.
3. **UI Updates - History List (`js/history.js`):**
   - In the roast card, display a summary of the tasting: "Total Score: 86.5" and a brief summary of the brew parameters (e.g., "V60 | 15g in / 250g out").
4. **Data Persistence (`js/storage.js`):**
   - Ensure the new `scores` and `brewLog` properties are serialized correctly when saving to `localStorage` and exporting/importing backups.