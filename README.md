# SUNAT NRUS Automation (Formulario 1611)

Automatización con Playwright para declarar y llegar hasta la pasarela de pago del **Nuevo RUS (Formulario Virtual N.° 1611)** en SUNAT Operaciones en Línea.

## Requisitos
- Node.js 18+
- Chromium para Playwright (`npx playwright install chromium` si aún no está instalado)

## Instalación
```bash
npm install
cp .env.example .env
```

Edita `.env` con tus credenciales Clave SOL, el periodo (`PERIODO_MES` `01`-`12` y `PERIODO_ANIO`), `VENTAS_MES` y `COMPRAS_MES`.

## Ejecución
```bash
npm start
```
O desde cualquier ubicación:
```bash
node /ruta/a/sunat-nrus-automation/pagar-nrus.js
```

## Validaciones incluidas
- Selección de mes en el datepicker de SUNAT (`Ene`..`Set`..`Dic`).
- Verificación obligatoria de que **no** esté marcado como declaración rectificatoria (`#casilla005no`).
- Detección de modales de alerta/error de SUNAT.
- Se detiene automáticamente al abrir el popup de la pasarela de pago para completar los datos de tarjeta de forma manual y segura.
