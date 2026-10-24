# ADR-0032 · Vistas en cuatro capas: cuadrícula fija y bloques dueños de su diseño

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D2)

## Contexto
Requisito de diseños y fuentes escalables (varios elementos por pantalla); el dueño pidió que nada se desplace ni se corte cuando no cabe.

## Decisión
Una vista combina **perfil de panel** (lo declara el aparato), **distribución** (una **cuadrícula fija** con áreas con nombre, definida en la vista, con otra opcional para panel vertical), **bloques** (cada uno dibuja un tipo de dato y es **dueño de su diseño**, incluido qué hace con el texto que no cabe) y **tema** (letras y medidas). Todo en unidades físicas. Un bloque calcula cuántos elementos caben y pone «+N más»; el motor revisa después de dibujar que nada se salga de su espacio, a lo alto ni a lo ancho.

## Consecuencias
Los diseños nuevos del dueño llegan como bloques o temas sin tocar el motor. Un desborde es un error que las pruebas detectan.
