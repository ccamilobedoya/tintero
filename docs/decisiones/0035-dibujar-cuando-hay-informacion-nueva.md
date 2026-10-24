# ADR-0035 · Se dibuja cuando hay información nueva, antes de que la pantalla despierte

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D6)

## Contexto
Lo que gasta batería es el WiFi encendido esperando. Si el servidor dibujara cuando la pantalla pregunta, la pantalla esperaría cada vez.

## Decisión
El servidor redibuja **cuando tiene información nueva**: un servicio le avisa o le entrega datos, la pantalla manda una acción, o una actualización programada corre **antes** de la próxima despertada de cada pantalla (y dibuja para la hora de esa despertada). La imagen tiene que estar lista al despertar; esperar hasta 2 s con `503 busy` + `Retry-After` queda solo como red de seguridad.

## Consecuencias
El motor lleva una cola de dibujo y recuerda cuándo vuelve cada pantalla. Una vista que comparten varias pantallas se dibuja una vez.
