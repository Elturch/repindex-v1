# Diagnóstico: ¿está vivo `chat-intelligence-v2` en el front?

Sin cambios de código. Solo grep + rutas.

## 1. Invocaciones desde `src/`
- `src/contexts/ChatContext.tsx:981` — resuelve el nombre con `getEdgeFunctionName(effectiveAgentVersion)` y hace el streaming al edge (`chat-intelligence` o `chat-intelligence-v2` según toggle).
- `src/contexts/ChatContext.tsx:1607` — `invokeWithTimeout('chat-intelligence', { action: 'enrich', ... })` para el enriquecimiento por rol.
- `src/lib/agentVersion.ts:171-173` — mapea `v2` → `'chat-intelligence-v2'`, resto → `'chat-intelligence'`.
- `src/components/chat/AgentVersionToggle.tsx` — switch preview-only v1/v2.

## 2. Montaje en la app
- `src/App.tsx:11-12` y `:104` — `FloatingChat` está **comentado** ("oculto por solicitud del usuario"). El widget flotante NO se renderiza.
- `src/App.tsx:9,56,105` — `<ChatProvider>` sigue envolviendo toda la app.
- `src/App.tsx:18,77` — la ruta **`/chat`** sigue montada: `<Route path="/chat" element={<ChatIntelligence />} />`.
- `src/pages/ChatIntelligence.tsx:14,38` — usa `useChatContext()` → dispara el flujo v1/v2.

## 3. Informes que ve el usuario hoy
Van por hooks + renderers, sin pasar por el chat:
- Hooks: `src/hooks/useComparisonDatapack.ts`, `useProfileDatapack.ts`, `useRankingDatapack.ts` → RPC `rix_*_datapack`.
- Renderers: `src/components/reports/ComparisonReport.tsx`, `ProfileReport.tsx`, `RankingReport.tsx`.
- PDF: `src/lib/reports/downloadReportPdf.ts` + `buildDeterministicReportHtml.ts`.
- Ninguno invoca `chat-intelligence*`.

## Veredicto
`chat-intelligence-v2` **NO es código muerto**. Está vivo y accesible en la ruta pública `/chat` (página `ChatIntelligence` + `ChatProvider`). Lo único desactivado es el `FloatingChat` flotante. Los informes (perfil/comparativa/ranking) están totalmente desacoplados del chat.

## Qué haría falta si MAT quiere "matar" el chat de verdad
1. Quitar `<Route path="/chat" ...>` y el import de `ChatIntelligence` en `src/App.tsx`.
2. (Opcional) retirar `<ChatProvider>` y el import.
3. (Opcional) borrar `src/pages/ChatIntelligence.tsx`, `src/contexts/ChatContext.tsx`, `src/components/chat/*`, `src/lib/agentVersion.ts` y hooks asociados si no los usa nadie más.
4. (Opcional server) desplegar `chat-intelligence` / `chat-intelligence-v2` con guard o eliminarlas.

No he tocado nada. Espero indicación.
