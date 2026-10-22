const key = 'astellas-partidas-v1';
const fields = [
  'id',
  'completedAt',
  'age',
  'frequency',
  'feeling',
  'zone',
  'result',
];
const headers = [
  'ID',
  'Fecha y hora',
  'Rango de edad',
  'Frecuencia',
  'Sensación',
  'Zona',
  'Resultado',
];
export const recordLabels = {
  age: {
    '30-40': '30 a 40',
    '40-55': '40 a 55',
    '55-60': '55 a 60',
    '60+': 'Más de 60',
  },
  frequency: {
    never: 'Nunca',
    sometimes: 'Ocasionalmente',
    often: 'Varias veces al día',
  },
  feeling: {
    calor: 'Calor repentino',
    sudor: 'Sudoración',
    interrumpe: 'Interrumpe actividades',
    todas: 'Todas las anteriores',
    ambas: 'Calor y sudoración',
  },
  zone: {
    cara: 'Cara y cuello',
    pecho: 'Pecho y espalda',
    cuerpo: 'Todo el cuerpo',
    extremidades: 'Brazos y antebrazos',
  },
  result: {
    none: 'Sin síntomas',
    mild: 'Leves',
    moderate: 'Moderados',
    severe: 'Severos',
  },
};

export function createRecordStore(storage) {
  function list() {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const records = JSON.parse(raw);
    if (!Array.isArray(records))
      throw new Error(
        'El archivo local de partidas no tiene el formato esperado.',
      );
    return records;
  }

  function save(record) {
    const records = list();
    const index = records.findIndex((entry) => entry.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
    storage.setItem(key, JSON.stringify(records));
    return record;
  }

  return { list, save };
}

export function recordsCsv(records) {
  const escape = (value) => {
    let text = String(value ?? '');
    // Evita que Excel interprete valores modificados en el almacenamiento como fórmulas.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      headers,
      ...records.map((record) =>
        fields.map(
          (field) => recordLabels[field]?.[record[field]] ?? record[field],
        ),
      ),
    ]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')
  );
}
