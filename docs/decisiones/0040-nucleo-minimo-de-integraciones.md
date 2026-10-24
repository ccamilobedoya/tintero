# ADR-0040 · Núcleo mínimo de integraciones antes de la bóveda

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-006, puerta 1, D0 y D8)

## Contexto
La primera integración (`trilium-tareas`) llega antes de la base de datos, la bóveda cifrada y la web de configuración, que siguen sin decidir.

## Decisión
La integración va en su propia ficha (**F-009**). El núcleo empieza con: manifiesto como objeto TypeScript; **llave en un archivo local** fuera del repo (permisos 600), leído al arrancar, hasta que llegue la bóveda; **cliente HTTP vigilado** (solo los hosts del manifiesto, tope de tamaño y de tiempo, registro sin contenido); escribir exige `writes: true` en el manifiesto **y** `allowWrite: true` en la configuración. Se consulta cada cierto tiempo; nada entra desde internet.

## Consecuencias
Cubre I1, I2, I4, I5 e I7 de `docs/seguridad.md` para la primera integración. La bóveda cifrada reemplaza el archivo de la llave en su ficha.
