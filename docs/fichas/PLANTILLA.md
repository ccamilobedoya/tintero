# F-NNN · Título

**Estado:** borrador | aprobada | en curso | verificada | cerrada
**Modelo del programador:** sonnet | haiku (ficha mecánica)
**Dependencias nuevas permitidas:** ninguna | `paquete` (por qué)

## Listo para programar (se marca antes de pedir aprobación)
- [ ] Cada CA se puede comprobar con una prueba, con valores concretos.
- [ ] El contrato (interfaces, formatos, errores) está escrito.
- [ ] Los archivos a crear o tocar están listados.
- [ ] Presupuestos y reglas de seguridad que aplican, nombrados.
- [ ] Lo que queda fuera de alcance, escrito.
- [ ] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos (incluida la convención de nombres de ejemplos o datos de prueba).

## Contexto
Por qué existe; ADR que aplica.

## Alcance
Qué entra. **Fuera de alcance:** qué no.

## Requisitos
- R1.

## Contrato
Interfaces, endpoints, tipos, formatos, errores.

## Criterios de aceptación
- **CA1.** Dado …, cuando …, entonces … (con valores).

## Presupuestos
Tiempos, tamaños, memoria.

## Seguridad
Reglas de `docs/seguridad.md` que aplican y cómo se comprueban. Siempre:
- [ ] Toda entrada externa con **límite de tamaño antes de parsear**.
- [ ] Servicios locales solo en **127.0.0.1**.
- [ ] Dependencias nuevas nombradas arriba (o ninguna).

## Archivos
A crear / a tocar.

## Resultado esperado
Cómo se ve cuando está listo.

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto).
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar: qué se hizo, vueltas, hallazgos, desviaciones.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
