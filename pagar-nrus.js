const { chromium } = require('playwright');
const { getConfig } = require('./config');

/**
 * Selecciona mes y año en el Bootstrap Datepicker de la casilla 007 (mm/aaaa).
 */
async function seleccionarPeriodo(frame, mesNombre, anioObjetivo) {
  const inputPeriodo = frame.locator('#casilla007');
  await inputPeriodo.click();

  const datepicker = frame.locator('.datepicker-months');
  const abierto = await datepicker.isVisible({ timeout: 1500 }).catch(() => false);
  if (!abierto) {
    await inputPeriodo.evaluate((el) => {
      if (window.$) window.$(el).datepicker('show');
    });
  }
  await datepicker.waitFor({ state: 'visible', timeout: 10000 });

  // Ajustar año si el año mostrado en el encabezado no coincide con anioObjetivo
  const yearSwitch = datepicker.locator('th.switch, th.datepicker-switch').first();
  for (let i = 0; i < 10; i++) {
    const anioActual = (await yearSwitch.innerText()).trim();
    if (anioActual === anioObjetivo) break;
    if (Number(anioActual) > Number(anioObjetivo)) {
      await datepicker.locator('th.prev').click();
    } else {
      await datepicker.locator('th.next').click();
    }
  }

  const mesBtn = datepicker.locator('.month', { hasText: new RegExp(`^${mesNombre}$`) });
  await mesBtn.waitFor({ state: 'visible', timeout: 5000 });
  if (await mesBtn.evaluate((el) => el.classList.contains('disabled'))) {
    throw new Error(`El mes ${mesNombre}/${anioObjetivo} aparece deshabilitado en SUNAT.`);
  }
  await mesBtn.click();
}

/**
 * Verifica si apareció algún modal de alerta/error de SUNAT tras elegir periodo o validar.
 */
async function verificarModalesAlerta(frame) {
  const modalVisible = frame.locator('.modal.in, .bootbox.modal.in').first();
  if (await modalVisible.isVisible({ timeout: 1500 }).catch(() => false)) {
    const texto = (await modalVisible.innerText()).trim();
    throw new Error(`SUNAT mostró un modal inesperado:\n${texto}`);
  }
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const config = getConfig();
  console.log(`Iniciando declaración NRUS 1611 para periodo ${config.periodo.mmAaaa}${dryRun ? ' [DRY-RUN]' : ''}...`);

  const browser = await chromium.launch({
    headless: config.opciones.headless,
    slowMo: 150,
  });

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  try {
    // 1. Login Clave SOL
    await page.goto(config.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#txtRuc').fill(config.credenciales.ruc);
    await page.locator('#txtUsuario').fill(config.credenciales.usuario);
    await page.locator('#txtContrasena').fill(config.credenciales.clave);
    await page.locator('#btnAceptar').click();

    // 2. Navegar en el Menú SOL hacia Nuevo RUS - 1611
    await page.locator('#ulSubmenu').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#ulSubmenu #nivel2_55_1 span').first().click();
    await page.locator('#ulSubmenu #nivel3_55_1_3 span').first().click();
    await page.locator('#ulSubmenu').getByText('Nuevo RUS -').click();

    // 3. Trabajar dentro del iframe de la aplicación
    const frame = page.frameLocator('iframe[name="iframeApplication"]');
    await frame.locator('#casilla007').waitFor({ state: 'visible', timeout: 20000 });

    // 4. Seleccionar periodo tributario (mm/aaaa)
    await seleccionarPeriodo(frame, config.periodo.mesNombre, config.periodo.anio);

    // Esperar a que SUNAT valide el periodo y habilite las casillas 507 y 607
    await frame.locator('#casilla507:not([disabled])').waitFor({ state: 'visible', timeout: 15000 });
    await verificarModalesAlerta(frame);

    // 5. Validación crítica: asegurar que NO está marcado como declaración rectificatoria
    const radioNo = frame.locator('#casilla005no');
    const radioSi = frame.locator('#casilla005si');
    if (!(await radioNo.isChecked()) || (await radioSi.isChecked())) {
      throw new Error('Abortado: la declaración está marcada como rectificatoria (casilla 005 = Sí) o no tiene marcado "No".');
    }
    console.log('Validación OK: Declaración original (Rectificatoria = No).');

    // 6. Llenar Ventas (casilla 507) y Compras (casilla 607)
    const casilla507 = frame.locator('#casilla507');
    await casilla507.fill(config.montos.ventasBrutas);
    await casilla507.press('Tab');

    const casilla607 = frame.locator('#casilla607');
    await casilla607.fill(config.montos.adquisiciones);
    await casilla607.press('Tab');

    // Leer categoría y cuota calculada por SUNAT
    await page.waitForTimeout(800);
    const categoria = await frame.locator('#casilla400').inputValue();
    const cuota = await frame.locator('#casilla503').inputValue();
    const importePagar = await frame.locator('#casilla505').inputValue();
    console.log(`Categoría calculada: ${categoria} | Cuota mensual: S/ ${cuota} | Importe a pagar: S/ ${importePagar}`);

    if (dryRun || process.env.DRY_RUN === 'true') {
      console.log('DRY_RUN: Detenido antes de Agregar a bandeja.');
      return;
    }

    // 7. Agregar a bandeja y pasar a Presentar/Pagar/NPS
    await frame.getByRole('button', { name: /Agregar a bandeja/i }).click();

    const btnPresentarBandeja = frame.getByRole('button', { name: 'Presentar/Pagar/NPS' });
    await btnPresentarBandeja.waitFor({ state: 'visible', timeout: 15000 });
    await btnPresentarBandeja.click();

    // Confirmar modal "¿Desea presentar y pagar?" -> Sí
    const btnSi = frame.locator('#btnPresentarPagar');
    await btnSi.waitFor({ state: 'visible', timeout: 10000 });
    await btnSi.click();

    // 8. Seleccionar medio de pago: Tarjeta de Crédito o Débito
    await frame.locator('#heading41').waitFor({ state: 'visible', timeout: 15000 });
    await frame.locator('#heading41').click();
    await frame.getByRole('link', { name: /Tarjeta de Crédito o Débito/i }).click();
    await frame.getByRole('radio', { name: /Horarios de Atención Las 24/i }).check();

    await frame.getByRole('button', { name: /Presentar\/Pagar/i }).click();

    // Primer modal "Aceptar" (términos / confirmación previa)
    const btnAceptar1 = frame.getByRole('button', { name: 'Aceptar' }).first();
    await btnAceptar1.waitFor({ state: 'visible', timeout: 10000 });
    await btnAceptar1.click();

    // Segundo modal "Aceptar" que abre el popup de la pasarela de pago
    const popupPromise = page.waitForEvent('popup', { timeout: 20000 });
    const btnAceptar2 = frame.getByRole('button', { name: 'Aceptar' }).first();
    await btnAceptar2.waitFor({ state: 'visible', timeout: 10000 });
    await btnAceptar2.click();

    const paymentPopup = await popupPromise;
    await paymentPopup.waitForLoadState('domcontentloaded');
    console.log('Pasarela de pago abierta en popup:', paymentPopup.url());
    console.log('Automatización completada hasta el pago. Completa los datos de tu tarjeta manualmente.');

    if (config.opciones.keepBrowserOpen) {
      await new Promise(() => {}); // Mantener abierto para completar el pago manualmente
    }
  } catch (err) {
    console.error('Error en la automatización:', err.message);
    process.exitCode = 1;
  } finally {
    if (!config.opciones.keepBrowserOpen) {
      await context.close();
      await browser.close();
    }
  }
})();
