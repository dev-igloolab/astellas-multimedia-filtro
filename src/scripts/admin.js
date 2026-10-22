import { createRecordStore, recordsCsv, recordLabels } from '../lib/records.js';
const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );
const label = (group, value) => recordLabels[group][value] || '—';
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
};

export function mountAdmin(app) {
  let records = [];
  let error = '';
  try {
    records = createRecordStore(localStorage).list();
  } catch (cause) {
    error =
      cause.message || 'No se pueden leer las partidas de este navegador.';
  }
  app.querySelector('[data-admin-count]').textContent = String(records.length);
  app.querySelector('[data-admin-count-label]').textContent =
    records.length === 1 ? 'partida completada' : 'partidas completadas';
  app.querySelector('.admin-export').disabled = !!error || !records.length;
  if (error) {
    const message = app.querySelector('.admin-error');
    message.hidden = false;
    message.textContent = error;
  }
  const totals = Object.keys(recordLabels.result).map((kind) => ({
    kind,
    total: records.filter((record) => record.result === kind).length,
  }));
  app.querySelector('.admin-stats').innerHTML = totals
    .map(
      ({ kind, total }) =>
        `<div class="admin-stat ${kind}"><span>${label('result', kind)}</span><strong>${total}</strong></div>`,
    )
    .join('');
  app.querySelector('.admin-breakdown-grid').innerHTML = [
    'age',
    'frequency',
    'feeling',
    'zone',
  ]
    .map(
      (group) =>
        `<div><h2>${{ age: 'Edad', frequency: 'Frecuencia', feeling: 'Sensación', zone: 'Zona' }[group]}</h2>${Object.keys(
          recordLabels[group],
        )
          .map(
            (value) =>
              `<p><span>${label(group, value)}</span><strong>${records.filter((record) => record[group] === value).length}</strong></p>`,
          )
          .join('')}</div>`,
    )
    .join('');
  app.querySelector('tbody').innerHTML = records.length
    ? [...records]
        .reverse()
        .map(
          (record, index) =>
            `<tr><td>${records.length - index}</td><td>${escapeHtml(dateLabel(record.completedAt))}</td><td>${label('age', record.age)}</td><td>${label('frequency', record.frequency)}</td><td>${label('feeling', record.feeling)}</td><td>${label('zone', record.zone)}</td><td><span class="admin-result ${recordLabels.result[record.result] ? record.result : ''}">${label('result', record.result)}</span></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="7" class="admin-empty">Aún no hay partidas completas en este dispositivo.</td></tr>';
  app.querySelector('.admin-export').addEventListener('click', () => {
    const blob = new Blob([recordsCsv(records)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `astellas-partidas-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}
