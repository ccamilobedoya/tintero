# Mapa del repositorio

> Generado por `tools/mapa` desde el README de cada carpeta. No editar a mano.

## Carpetas
- `config/`: Ejemplos de configuración local con valores de relleno. Los valores reales van fuera del repo (ver docs/configuracion-local.md).
- `contract/`: Contrato versionado entre el servidor, el emulador y el firmware (F-001). Los esquemas se escriben una sola vez con TypeBox (`src/schemas.ts`); de ellos salen los tipos, los validadores, los JSON Schema y el OpenAPI.
- `deploy/`: Plantillas para correr Tintero como servicio (F-010): la unidad de systemd de usuario (`tintero.service.in`). La rellena e instala `tools/instalar-servicio` con las rutas de la configuración local; aquí no va nada real (ADR-0023).
- `deploy/funnel/`: Plantillas del nodo de Tailscale propio de Tintero (F-012, ADR-0047): un contenedor `tailscale/tailscale` que entra al tailnet como el aparato `tintero` y abre Funnel **solo en ese nodo** (TCP 443 → Tintero en `127.0.0.1`), así no se publica el nombre del servidor. Las rellena `tools/instalar-funnel` con la configuración local; aquí no va nada real (ADR-0023).
- `docs/`: Documentación del repo: fichas, decisiones (ADR), plantillas, proceso, seguridad, lecciones y métricas.
- `docs/decisiones/`: Registros de decisión (ADR): una página por decisión tomada, con contexto, opciones y consecuencias. Obligan a todos los agentes.
- `docs/fichas/`: Especificaciones aprobadas por el dueño (F-NNN). La plantilla está en PLANTILLA.md; se publican en Trilium con tools/publicar-ficha.
- `docs/informes/`: Informes de los agentes por ficha (docs/informes/F-NNN/), con formato fijo. Los escribe el arquitecto a partir de lo que entregan los agentes; quedan en git como trazabilidad.
- `docs/plantillas/`: Formatos fijos de los informes de cada agente y del resumen para aprobar desde el celular.
- `emulator/`: Emulador de pantalla: un cliente que se porta como el ESP32 (contrato v1, navegación con dos botones) y deja en una carpeta lo que mostraría el panel.
- `firmware/`: Firmware del ESP32 (C++, PlatformIO). Lo escribe el dueño del proyecto; los agentes solo ayudan si él lo pide (ADR-0013).
- `server/`: Servidor mínimo de Tintero (F-003): habla el contrato v1 con vistas de demostración (`demo`, `detalle`, `patron`) dibujadas por código en `raw1`, para cualquier panel declarado. Solo escucha en `127.0.0.1`, sin TLS (demostración local) o con TLS y certificado de cliente (F-004); el estado vive en memoria.
- `server/fonts/`: Letras del tema `base` del motor de vistas (F-005, ADR-0034): DejaVu Sans para títulos y texto, Terminus (mapa de bits) para los detalles. Las monta el contenedor de Chromium de solo lectura, con `fonts.conf` (sin suavizado).
- `server/src/integrations/`: Núcleo mínimo de integraciones (F-009, ADR-0040 a ADR-0043): lo que una integración pide y lo que el servidor concede.
- `tests/`: Pruebas que no viven junto al código: aceptación (del verificador) y regresión de los agentes.
- `tests/acceptance/`: Pruebas de aceptación por ficha (tests/acceptance/F-NNN/). Solo las escribe el verificador, a partir de la ficha.
- `tests/agents/`: Regresión de los agentes (P8): una ficha de juguete con una ambigüedad y un error plantados, para comprobar que el ciclo los sigue detectando cuando el arquitecto cambia un agente.
- `tools/`: Herramientas del proceso: revisar, check-scope, publicar-ficha, mapa, hooks de git y de Claude Code, y las reglas propias de semgrep (`semgrep/`). Las mantiene el arquitecto.

## Agentes
- `.claude/agents/integrador.md` (haiku): Hace los commits y los push de Tintero al terminar cada fase del ciclo (ficha, pruebas, código, verificación, revisión, cierre).
- `.claude/agents/programador.md` (sonnet): Implementa una ficha aprobada de Tintero (docs/fichas/F-NNN-*.md) en la rama y la carpeta que le indica el arquitecto.
- `.claude/agents/revisor.md` (haiku): Interpreta la revisión automática de Tintero (.revisar/resumen.md) solo cuando hace falta.
- `.claude/agents/verificador.md` (sonnet): Verifica una ficha de Tintero sin el contexto de quien programó.
