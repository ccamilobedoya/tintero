# ADR-0046 · Tintero corre como servicio de systemd de usuario

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-010, D1–D3)

## Contexto
El servidor de la casa se apaga a veces y Tintero se arrancaba a mano. Hace falta que arranque con la máquina y se levante solo si se cae, sin depender de una sesión abierta ni de `sudo`.

## Decisión
Un servicio de **systemd de usuario** (`tintero.service`) con `Restart=always`, `RestartSec=5` y sin tope de reinicios, habilitado en `default.target` (el usuario tiene *linger*). Si Docker no está listo, el servidor sale y systemd lo reintenta (F-011 agrega la espera dentro del proceso). Los contenedores de Chromium llevan la etiqueta `tintero.chromium=1` y la de su instancia; el servicio arranca con `--instance servicio` y borra al arrancar los huérfanos **de su misma instancia** (nunca el Chromium de otro Tintero que esté corriendo). La unidad sale de una plantilla del repo (`deploy/tintero.service.in`) que rellena `tools/instalar-servicio` con la configuración local.

## Consecuencias
Sin `sudo` y sin contenedor para Tintero (necesitaría el *socket* de Docker, que equivale a ser administrador). Un servicio de usuario no puede esperar a `docker.service`: por eso los reintentos. Los registros van al diario (`journalctl --user -u tintero`).
