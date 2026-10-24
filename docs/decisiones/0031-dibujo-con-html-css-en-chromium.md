# ADR-0031 · Las vistas se dibujan con HTML/CSS en un Chromium sin interfaz

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D1)

## Contexto
El motor de vistas tiene que convertir diseños escalables en imágenes de 1 bit nítidas y saber dónde quedó cada elemento con foco (zonas, ADR-0006).

## Decisión
HTML/CSS en un **Chromium sin interfaz** que corre en un contenedor Docker endurecido (solo lectura, sin capacidades, topes de memoria y procesos, CDP solo en `127.0.0.1`, imagen fijada por *digest*), manejado con `playwright-core` por CDP. El texto se dibuja **sin suavizado** (fontconfig) para que la captura salga en blanco y negro puros; las zonas y los desbordes se leen de la página. Todo detrás de una interfaz `Renderer`.

## Consecuencias
Medido: 0 píxeles grises, 180–370 ms por vista. Dependencia nueva `playwright-core` (zona sensible) y un contenedor más. Los diseños son HTML/CSS (se pueden aportar). Lo que se dibuja no puede salir a la red: escape de todo texto, CSP `default-src 'none'`, JavaScript apagado y toda petición bloqueada. Alternativas descartadas: Satori + resvg (texto suavizado, CSS parcial) y dibujo propio (diseños en código).
