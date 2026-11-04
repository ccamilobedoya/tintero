# ADR-0064 · El firmware se cura solo: plazos, *watchdog*, espera creciente y avisos

- **Estado:** aceptada
- **Fecha:** 2026-11-04 · **Decidió:** dueño del proyecto (F-019, D1, D3, D4 y D5)

## Contexto
La pantalla real se quedó trabada horas recibiendo una imagen: `HTTPClient::writeToStream` (Arduino-ESP32) espera mientras la conexión siga abierta, sin plazo, y no había *watchdog*. Reiniciar no ayudaba, y sin el monitor serie no había cómo saber qué pasó.

## Decisión
- El firmware lee las respuestas con un lector propio, sin Arduino y probado en el PC: plazo sin progreso (10 s), plazo total (15 s, 30 s la imagen) y topes de cabeceras. No usa `HTTPClient`.
- Reutiliza la conexión solo tras una respuesta que terminó bien; si no, abre una nueva.
- *Task watchdog* de 60 s sobre `loop()`.
- Tras fallas seguidas espera 30 s, 60 s… hasta 15 min; con 8 fallas, o con poca memoria, se reinicia (como mucho una vez por hora).
- La última falla y el motivo del arranque se guardan en la memoria RTC y se mandan al servidor con `POST /api/v1/log`.
- Lo que el firmware no conoce (un `act`, un formato) se salta en vez de invalidar todo; el servidor nunca manda un índice ni unas zonas por encima de los topes del contrato.

## Consecuencias
Un caso normal (la red se traba, crecen las tareas, cambia la configuración del servidor) no obliga a grabar el firmware. Lo que sí lo obliga (Wi-Fi, nombre del servidor, CA, corregir el firmware) queda para fichas futuras: portal de configuración, CA de respaldo, OTA.
