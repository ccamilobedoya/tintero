# ADR-0054 · Calendarios por dirección iCalendar, leídos con `ical.js`

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-014, D2 a D6)

## Contexto
El dueño usa calendarios de iCloud y de dos cuentas de Google (una de trabajo). Se pidió que durara sin renovar permisos y que no se atara a una plataforma.

## Decisión
Cada calendario se lee por su **dirección iCalendar** de solo lectura: el «Calendario público» de iCloud y la «Dirección secreta en formato iCal» de Google (también la de trabajo, que la empresa ofrece). Las direcciones son secretos y viven en un archivo con permisos 600 fuera del repo. El formato se lee con **`ical.js`** (MPL-2.0, sin dependencias propias), que resuelve repeticiones, excepciones y zonas horarias. Los títulos se muestran completos en todos los calendarios.

## Consecuencias
Sin OAuth: no hay permisos que venzan, pero quien tenga una dirección lee ese calendario; si se filtra, se cambia desde el calendario. El cliente con guardia gana una lectura de texto. La política de la empresa sobre datos de trabajo en un servidor personal sigue siendo responsabilidad del dueño.
