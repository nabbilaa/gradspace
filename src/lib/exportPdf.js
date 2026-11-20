export function exportInternshipPdf({ logs, totalWeeks, completedCount, pct, meta = {} }) {
  const sortedLogs = [...logs].sort((a, b) => a.week_number - b.week_number);
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const rowsHtml =
    sortedLogs.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px;">Belum ada catatan logbook mingguan.</td></tr>`
      : sortedLogs
          .map((log) => {
            const start = new Date(log.start_date).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const end = new Date(log.end_date).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const evidenceCount = log.evidences?.length || 0;
            return `
              <tr>
                <td style="text-align:center;font-weight:600;">Week ${log.week_number}</td>
                <td>${start} – ${end}</td>
                <td style="white-space:pre-line;">${escapeHtml(log.summary)}${
              log.blockers
                ? `<div style="margin-top:6px;padding:6px 8px;background:#fffbeb;border-left:2px solid #f59e0b;font-size:11px;color:#78350f;"><strong>Kendala:</strong> ${escapeHtml(
                    log.blockers
                  )}</div>`
                : ''
            }</td>
                <td style="text-align:center;">${
                  log.status === 'completed' ? 'Selesai' : 'Berjalan'
                }</td>
                <td style="text-align:center;">${
                  evidenceCount > 0 ? `${evidenceCount} file` : '-'
                }</td>
              </tr>
            `;
          })
          .join('');

  const metaItems = [
    { label: 'Tanggal Cetak', value: printDate },
    { label: 'Progres Magang', value: `${completedCount} dari ${totalWeeks} Minggu (${pct}%)` },
    {
      label: meta.company ? 'Instansi & Posisi' : 'Total Catatan',
      value: meta.company
        ? `${meta.company}${meta.role ? ` (${meta.role})` : ''}`
        : `${sortedLogs.length} Minggu Tercatat`,
    },
  ];

  const html = buildPrintDocument({
    docTitle: 'Laporan Logbook Kegiatan Magang / PKL',
    subtitle: 'GradSpace • Academic & Internship Tracker',
    metaItems,
    tableHeaders: ['Minggu', 'Periode', 'Ringkasan Aktivitas & Kendala', 'Status', 'Lampiran'],
    columnWidths: ['10%', '20%', '48%', '12%', '10%'],
    rowsHtml,
    signatureLeft: 'Mahasiswa Pelaksana,',
    signatureRight: meta.mentor
      ? `Pembimbing Lapangan (${meta.mentor}),`
      : 'Pembimbing Lapangan / PKL,',
  });

  openPrintWindow(html);
}

export function exportThesisPdf({
  supervisions,
  milestones,
  thesisProgress,
  filterLabel = 'Semua Dosen Pembimbing',
}) {
  const sortedSupervisions = [...supervisions].sort(
    (a, b) => new Date(a.supervision_date) - new Date(b.supervision_date)
  );
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const milestonesHtml = milestones
    .map(
      (m) => `
      <span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 8px;border-radius:4px;font-size:11px;border:1px solid ${
        m.is_completed ? '#a7f3d0' : '#e2e8f0'
      };background:${m.is_completed ? '#ecfdf5' : '#f8fafc'};color:${
        m.is_completed ? '#065f46' : '#475569'
      };">
        ${m.is_completed ? '✓' : '○'} ${escapeHtml(m.title)} (${m.weight_percentage}%)
      </span>
    `
    )
    .join('');

  const rowsHtml =
    sortedSupervisions.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:16px;">Belum ada riwayat bimbingan tercatat.</td></tr>`
      : sortedSupervisions
          .map((item, index) => {
            const dateStr = new Date(item.supervision_date).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            const supervisorInfo = item.supervisors
              ? `${escapeHtml(item.supervisors.name)}<br/><span style="font-size:10px;color:#64748b;">${escapeHtml(
                  item.supervisors.role
                )}</span>`
              : '-';
            return `
              <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td>${dateStr}</td>
                <td>${supervisorInfo}</td>
                <td style="white-space:pre-line;">${escapeHtml(item.notes)}</td>
                <td style="text-align:center;">${
                  item.status === 'approved' ? 'ACC / Selesai' : 'Revisi'
                }</td>
              </tr>
            `;
          })
          .join('');

  const html = buildPrintDocument({
    docTitle: 'Kartu Kendali & Riwayat Bimbingan Skripsi / TA',
    subtitle: 'GradSpace • Academic & Internship Tracker',
    metaItems: [
      { label: 'Tanggal Cetak', value: printDate },
      { label: 'Filter Pembimbing', value: filterLabel },
      { label: 'Progres Skripsi', value: `${thesisProgress}% Tercapai` },
    ],
    extraSectionHtml:
      milestones.length > 0
        ? `<div style="margin-bottom:16px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff;">
            <div style="font-size:11px;font-weight:700;color:#334155;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em;">
              Status Tahapan Skripsi / Tugas Akhir
            </div>
            <div>${milestonesHtml}</div>
          </div>`
        : '',
    tableHeaders: ['No', 'Tanggal', 'Dosen Pembimbing', 'Catatan Revisi / Arahan', 'Status'],
    columnWidths: ['6%', '16%', '24%', '40%', '14%'],
    rowsHtml,
    signatureLeft: 'Mahasiswa,',
    signatureRight: 'Dosen Pembimbing,',
  });

  openPrintWindow(html);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrintDocument({
  docTitle,
  subtitle,
  metaItems,
  extraSectionHtml = '',
  tableHeaders,
  columnWidths,
  rowsHtml,
  signatureLeft,
  signatureRight,
}) {
  const metaHtml = metaItems
    .map(
      (m) => `
      <div>
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
          m.label
        )}</div>
        <div style="font-size:13px;font-weight:600;color:#0f172a;margin-top:2px;">${escapeHtml(
          m.value
        )}</div>
      </div>
    `
    )
    .join('');

  const thHtml = tableHeaders
    .map(
      (h, i) =>
        `<th style="width:${columnWidths[i] || 'auto'};text-align:${
          i === 0 ? 'center' : 'left'
        };">${escapeHtml(h)}</th>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }
    .header {
      border-bottom: 2px solid #4f46e5;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header h1 {
      margin: 0;
      font-size: 18px;
      color: #0f172a;
    }
    .header p {
      margin: 2px 0 0;
      font-size: 11px;
      color: #6366f1;
      font-weight: 600;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
    }
    th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
    }
    td {
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
      font-size: 11.5px;
    }
    tr:nth-child(even) td {
      background: #fcfcfd;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 32px;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 210px;
      text-align: center;
      font-size: 12px;
    }
    .sig-line {
      margin-top: 64px;
      border-top: 1px solid #475569;
      padding-top: 4px;
      color: #475569;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <p>${escapeHtml(subtitle)}</p>
      <h1>${escapeHtml(docTitle)}</h1>
    </div>
  </div>

  <div class="meta-grid">${metaHtml}</div>

  ${extraSectionHtml}

  <table>
    <thead><tr>${thHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="signatures">
    <div class="sig-box">
      <div>${escapeHtml(signatureLeft)}</div>
      <div class="sig-line">Nama & NIM</div>
    </div>
    <div class="sig-box">
      <div>${escapeHtml(signatureRight)}</div>
      <div class="sig-line">Nama & NIP/NIDN</div>
    </div>
  </div>
</body>
</html>`;
}

function openPrintWindow(html) {
  const printWin = window.open('', '_blank', 'width=900,height=700');
  if (!printWin) {
    alert('Pop-up diblokir browser. Izinkan pop-up untuk mengekspor PDF.');
    return;
  }
  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
  }, 300);
}