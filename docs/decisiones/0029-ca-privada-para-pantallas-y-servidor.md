# ADR-0029 · Autoridad de certificados privada para pantallas y servidor

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-004, puerta 1, D2 y D5)

## Contexto
Cada pantalla necesita un certificado de cliente (L1), y el aparato tiene que validar al servidor. El certificado público de `tailscale cert` vence a los ~90 días, su cadena cambió de jerarquía en 2026 y son 4 certificados en cada saludo.

## Decisión
Una **CA privada de Tintero**, creada con la CLI `openssl` (`npm run pki`), firma los certificados de las pantallas (`clientAuth`) **y** el del servidor (`serverAuth`, con el nombre público). Todo ECDSA P-256. Vigencias: CA 10 años, pantalla 5, servidor 2. El aparato confía **solo** en esa CA. Llaves y certificados **fuera del repo** (carpeta 700, llaves 600; ADR-0023). Alternativa descartada: el certificado público de Let's Encrypt.

## Consecuencias
Sin renovaciones cada 90 días ni dependencia de las raíces públicas; saludo más corto en el ESP32. Un navegador no confía en ese certificado: la API de aparatos no es para navegadores (la web de configuración irá por otro lado). Perder la llave de la CA obliga a reemitir todo: va en el respaldo cifrado, nunca en el repo.
