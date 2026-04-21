# Restricciones arquitectonicas INQUEBRANTABLES del Agente Rix v2

1. index.ts NO puede superar 150 lineas

2. orchestrator.ts NO puede superar 300 lineas

3. Ningun archivo puede superar 500 lineas

4. Ningun prompt individual puede superar 800 tokens

5. Cada skill DEBE implementar la interface Skill de specs/types.ts

6. Cada skill DEBE tener su propio archivo en skills/

7. El orchestrator NO puede contener logica SQL

8. Los parsers NO pueden contener logica de prompts

9. Las tablas de KPIs SIEMPRE se pre-renderizan en datapack/tableRenderer.ts, NUNCA las genera el LLM

10. El DataPack DEBE cumplir la interface DataPack de specs/types.ts

11. Cada skill DEBE tener al menos 3 tests unitarios

12. El v1 (chat-intelligence/index.ts) NO se modifica en ningun paso

13. Los modulos _shared existentes se reutilizan via import, NO se duplican

14. El prompt se compone dinamicamente: base + antiHallucination + (mode rules) + (skill rules). Cada query recibe SOLO las reglas que le aplican.

15. Si mode=period y weeks>1: datos = agregados (mean/median/min/max/trend). PROHIBIDO mostrar valor de ultima semana como dato principal.

16. Si mode=snapshot y weeks=1: datos = valor puntual + delta vs semana anterior.

17. Herencia de contexto: si la pregunta no menciona empresa, heredar del turno anterior.

18. Ambito: solo empresas espanolas. Si piden empresa extranjera, explicar que no esta disponible.