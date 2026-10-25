# deploy/funnel

Plantillas del nodo de Tailscale propio de Tintero (F-012, ADR-0047): un contenedor `tailscale/tailscale` que entra al tailnet como el aparato `tintero` y abre Funnel **solo en ese nodo** (TCP 443 → Tintero en `127.0.0.1`), así no se publica el nombre del servidor. Las rellena `tools/instalar-funnel` con la configuración local; aquí no va nada real (ADR-0023).
