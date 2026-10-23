# Métricas por ficha (P7)

| Ficha | Modelo programador | Vueltas verificación | Vueltas revisión | Hallazgos (bloq./mejora) | Revisor con modelo | Tokens (si se conocen) | Notas |
|-------|--------------------|----------------------|------------------|--------------------------|--------------------|------------------------|-------|
| F-000 | (arquitecto, excepción de arranque) | 1 (verificador final) | 1 (revisor juicio sobre `tools/`) | 0 bloq. / 3 mejoras | Sí (Sonnet) | USD 0,57 en 7 corridas (regresión ×5, verificador final, revisor) | Registro de npm lento → revisar en paralelo |
| F-001 | sonnet (v1, v4) · haiku (v2, v3) | 5 (todas CUMPLE; reverificación por cambios de código) | 3 (hallazgos Haiku, juicio Sonnet con 1 bloqueante, confirmación) | 1 bloq. / 3 mejoras (+ 7 de forma en pruebas) | Sí | USD 2,86 en 50 corridas | Una corrida cortada por el límite de uso de la cuenta |
