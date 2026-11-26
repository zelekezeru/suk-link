# Suk Link — Translation & Localization Review Status (`src/i18n/STATUS.md`)

Per Section 8.1 of the Build Plan:
- `en.json` is the single source of truth for keys and interpolation placeholders (`{{...}}`).
- A unit test (`tests/unit/i18n.test.ts`) verifies 100% key parity and placeholder parity across all six locale files (`en`, `am`, `om`, `so`, `ti`, `sw`).

| Locale Code | Language Name | Script | Font Family | Demo-Path Strings Status | Full File Status | Reviewer Notes |
|---|---|---|---|---|---|---|
| `en` | English | Latin | Inter | `reviewed` | `reviewed` | Source locale and fallback |
| `am` | Amharic (አማርኛ) | Ge'ez | Noto Sans Ethiopic | `reviewed` | `reviewed` | Native Amharic terminology verified ("በዱቤ", "ቅርጫት", "ሸቀጣ ሸቀጥ") |
| `om` | Afaan Oromoo | Latin | Inter | `reviewed` | `draft` | Demo-path strings reviewed; non-demo strings in draft pending final pass |
| `so` | Somali (Soomaali) | Latin | Inter | `reviewed` | `draft` | Demo-path strings reviewed; non-demo strings in draft pending final pass |
| `ti` | Tigrinya (ትግርኛ) | Ge'ez | Noto Sans Ethiopic | `reviewed` | `draft` | Demo-path strings reviewed; non-demo strings in draft pending final pass |
| `sw` | Kiswahili | Latin | Inter | `reviewed` | `draft` | Demo-path strings reviewed for KE market expansion; rest in draft |

## `ui.*` namespace (added in the Stage 1 i18n sweep)

About 65 strings that were previously hard-coded in English now live under `ui.*` in all six files. English is the source. The `am`, `om`, `so`, `ti` and `sw` values are **`draft`**: machine-quality translations written during the sweep, **not native-reviewed**. They need a native-speaker pass before release, starting with the demo path (`ui.cart.*`, `ui.orders.*`, `ui.shop.orderAccepted`, `ui.payments.*`).
