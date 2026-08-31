/** Modeller som erbjuds i inställnings-UI:t. Delas av klient och server. */
export const ANTHROPIC_MODELS = [
  { id: "claude-fable-5", label: "Claude Fable 5 — bäst, dyrast" },
  { id: "claude-opus-5", label: "Claude Opus 5 — mycket bra" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — bra & prisvärd (standard)" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 — snabbast, billigast" },
] as const;
