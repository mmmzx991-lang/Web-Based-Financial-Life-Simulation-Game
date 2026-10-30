const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function wealthChart(
  history = [],
  labels = { wealth: "Net worth", benchmark: "Benchmark", age: "Age" },
) {
  const records = history.filter((row) => Number.isFinite(row.netWorth));
  if (!records.length) return '<div class="chart-empty">—</div>';
  const stride = Math.max(1, Math.floor(records.length / 100));
  const rows = records.filter(
    (_, i) => i % stride === 0 || i === records.length - 1,
  );
  const values = rows.flatMap((r) => [
    r.netWorth,
    Number.isFinite(r.benchmark) ? r.benchmark : r.netWorth,
  ]);
  const min = Math.min(0, ...values),
    max = Math.max(10000, ...values),
    range = max - min;
  const x = (i) => 52 + (i / Math.max(1, rows.length - 1)) * 626;
  const y = (value) => 190 - ((value - min) / range) * 158;
  const line = (key) =>
    rows
      .map(
        (r, i) =>
          `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number.isFinite(r[key]) ? r[key] : r.netWorth).toFixed(1)}`,
      )
      .join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => {
    const value = min + (range * i) / 3,
      position = y(value);
    return `<g><line x1="52" y1="${position}" x2="678" y2="${position}" class="chart-grid"/><text x="42" y="${position + 4}" text-anchor="end">${(value / 100000).toFixed(0)}k</text></g>`;
  }).join("");
  const steps = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  return `<svg class="wealth-chart" viewBox="0 0 706 225" role="img" aria-label="${escape(labels.wealth)} / ${escape(labels.benchmark)}"><title>${escape(labels.wealth)} / ${escape(labels.benchmark)}</title>${ticks}<path d="${line("benchmark")}" class="benchmark-line"/><path d="${line("netWorth")}" class="wealth-line"/>${steps.map((i) => `<text x="${x(i)}" y="215" text-anchor="middle">${escape(labels.age)} ${Math.floor(rows[i].ageMonths / 12)}</text>`).join("")}</svg>`;
}
export function priceChart(history = [], label = "Price") {
  const rows = history
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .slice(-24);
  if (!rows.length) return '<div class="chart-empty">—</div>';
  const low = Math.min(...rows.map((r) => r.price)),
    high = Math.max(...rows.map((r) => r.price));
  const padding = Math.max(1, (high - low) * 0.12, high * 0.005),
    min = low - padding,
    max = high + padding;
  const x = (i) => 48 + (i / Math.max(1, rows.length - 1)) * 500,
    y = (price) => 146 - ((price - min) / (max - min)) * 125;
  const path = rows
    .map(
      (row, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(2)},${y(row.price).toFixed(2)}`,
    )
    .join(" ");
  const last = rows.at(-1),
    axis = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter(
      (v, i, a) => a.indexOf(v) === i,
    );
  return `<svg class="price-chart" viewBox="0 0 570 181" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${[min, (min + max) / 2, max].map((value) => `<line class="chart-grid" x1="48" y1="${y(value)}" x2="548" y2="${y(value)}"/><text x="40" y="${y(value) + 3}" text-anchor="end">${(Math.max(0, value) / 100).toFixed(2)}</text>`).join("")}<path class="price-line" d="${path}"/><circle cx="${x(rows.length - 1)}" cy="${y(last.price)}" r="3" class="price-dot"/>${axis.map((i) => `<text x="${x(i)}" y="173" text-anchor="middle">M${rows[i].month}</text>`).join("")}</svg>`;
}
