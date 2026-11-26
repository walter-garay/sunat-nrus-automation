const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

/**
 * Nombres exactos de los meses en el datepicker de SUNAT (Formulario 1611).
 * Nota: Septiembre aparece como "Set" (no "Sep").
 */
const MESES_SUNAT = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
};

function normalizarMes(mesRaw) {
  const limpio = String(mesRaw || '').trim();
  const padded = limpio.padStart(2, '0');
  if (MESES_SUNAT[padded]) {
    return { numero: padded, nombreDatepicker: MESES_SUNAT[padded] };
  }
  const porNombre = Object.entries(MESES_SUNAT).find(
    ([, nombre]) => nombre.toLowerCase() === limpio.toLowerCase()
  );
  if (porNombre) {
    return { numero: porNombre[0], nombreDatepicker: porNombre[1] };
  }
  throw new Error(
    `PERIODO_MES inválido: "${mesRaw}". Usa 01-12 o uno de: ${Object.values(MESES_SUNAT).join(', ')}`
  );
}

function getConfig() {
  const ruc = process.env.SUNAT_RUC?.trim();
  const usuario = process.env.SUNAT_USUARIO?.trim();
  const clave = process.env.SUNAT_CLAVE?.trim();

  if (!ruc || !usuario || !clave) {
    throw new Error('Faltan credenciales en .env (SUNAT_RUC, SUNAT_USUARIO, SUNAT_CLAVE).');
  }

  const mes = normalizarMes(process.env.PERIODO_MES);
  const anio = String(process.env.PERIODO_ANIO || '').trim();
  if (!/^\d{4}$/.test(anio)) {
    throw new Error(`PERIODO_ANIO inválido: "${anio}". Debe ser YYYY (ej. 2026).`);
  }

  const ventas = String(process.env.VENTAS_MES ?? '').trim();
  const compras = String(process.env.COMPRAS_MES ?? '').trim();
  if (!/^\d+$/.test(ventas) || !/^\d+$/.test(compras)) {
    throw new Error('VENTAS_MES y COMPRAS_MES deben ser números enteros en soles.');
  }

  return {
    url: 'https://e-menu.sunat.gob.pe/cl-ti-itmenu2/MenuInternetPlataforma.htm?pestana=*&agrupacion=*&exe=55.2.1.1.1',
    credenciales: { ruc, usuario, clave },
    periodo: {
      mesNumero: mes.numero,
      mesNombre: mes.nombreDatepicker,
      anio,
      mmAaaa: `${mes.numero}/${anio}`,
    },
    montos: {
      ventasBrutas: ventas,   // Casilla 507
      adquisiciones: compras, // Casilla 607
    },
    opciones: {
      headless: process.env.HEADLESS === 'true',
      keepBrowserOpen: process.env.KEEP_BROWSER_OPEN !== 'false',
    },
  };
}

module.exports = { getConfig, MESES_SUNAT };
