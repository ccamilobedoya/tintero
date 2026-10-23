# Métricas por ficha (P7)

| Ficha | Modelo programador | Vueltas verificación | Vueltas revisión | Hallazgos (bloq./mejora) | Revisor con modelo | Tokens (si se conocen) | Notas |
|-------|--------------------|----------------------|------------------|--------------------------|--------------------|------------------------|-------|
| F-000 | (arquitecto, excepción de arranque) | 1 (verificador final) | 1 (revisor juicio sobre `tools/`) | 0 bloq. / 3 mejoras | Sí (Sonnet) | USD 0,57 en 7 corridas (regresión ×5, verificador final, revisor) | Registro de npm lento → revisar en paralelo |
| F-001 | sonnet (v1, v4) · haiku (v2, v3) | 5 (todas CUMPLE; reverificación por cambios de código) | 3 (hallazgos Haiku, juicio Sonnet con 1 bloqueante, confirmación) | 1 bloq. / 3 mejoras (+ 7 de forma en pruebas) | Sí | USD 2,86 en 50 corridas | Una corrida cortada por el límite de uso de la cuenta |
| F-002 | sonnet | 1 (CUMPLE 21/21 a la primera) | 1 (juicio, aprobado) | 0 bloq. / 3 mejoras | Sí (Sonnet) | USD 2,51 en 14 corridas | Primera ficha con las reglas nuevas: sin tropiezos de proceso |
| F-003 | sonnet | 1 (CUMPLE 16/16) | 1 (juicio, aprobado) | 0 bloq. / 4 mejoras (2 obligatorias en F-004) | Sí (Sonnet) | USD 2,46 en 24 corridas (incl. regresión) | Corte por límite de uso; informe del programador perdido; 8 lecciones de proceso |
| F-004 | sonnet | 2 (v1 NO CUMPLE solo CA11: un mensaje; v2 CUMPLE) | 1 (juicio, aprobado) | 0 bloq. / 4 mejoras | Sí (Sonnet) | USD 2,14 en 13 corridas | CA10 en vivo por Funnel: lo corrió el dueño (el modo automático no deja al arquitecto abrir túneles) |
