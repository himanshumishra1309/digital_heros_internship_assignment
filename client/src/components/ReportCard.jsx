import StatCard from "./StatCard";

function statusTone(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 400) return "good";
  return "alert";
}

function ReportCard({ report }) {
  const {
    url,
    httpStatus,
    responseTimeMs,
    title,
    metaDescription,
    h1Count,
    imagesTotal,
    imagesMissingAlt,
    wordCount,
    cached,
  } = report;

  const altTone = imagesMissingAlt > 0 ? "alert" : "good";
  const h1Tone = h1Count === 1 ? "good" : "warning";

  return (
    <section className="report-card">
      <header className="report-card__header">
        <span className="report-card__eyebrow">Diagnostic report</span>
        {cached && <span className="report-card__badge">from cache</span>}
      </header>

      <p className="report-card__url">{url}</p>

      <div className="stat-row">
        <StatCard label="HTTP status" value={httpStatus} tone={statusTone(httpStatus)} />
        <StatCard label="Response time" value={`${responseTimeMs} ms`} />
        <StatCard label="Word count" value={wordCount.toLocaleString()} />
      </div>

      <div className="report-card__block">
        <span className="report-card__field-label">Title</span>
        <p className="report-card__field-value">{title || "— not found —"}</p>
      </div>

      <div className="report-card__block">
        <span className="report-card__field-label">Meta description</span>
        <p className="report-card__field-value">{metaDescription || "— not found —"}</p>
      </div>

      <div className="stat-row">
        <StatCard label="H1 count" value={h1Count} tone={h1Tone} />
        <StatCard
          label="Images missing alt"
          value={`${imagesMissingAlt} / ${imagesTotal}`}
          tone={altTone}
        />
      </div>
    </section>
  );
}

export default ReportCard;
