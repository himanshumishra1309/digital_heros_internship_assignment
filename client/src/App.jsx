import { useState } from "react";
import PulseWaveform from "./components/PulseWaveform";
import UrlForm from "./components/UrlForm";
import ReportCard from "./components/ReportCard";
import ErrorNotice from "./components/ErrorNotice";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [report, setReport] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/v1/urlData/pageInfo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const body = await res.json();

      if (!res.ok || !body.success) {
        setStatus("error");
        setReport(null);
        setErrorMessage(body.message || "That page couldn't be checked.");
        return;
      }

      setReport(body.data);
      setStatus("success");
    } catch {
      setStatus("error");
      setReport(null);
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="page">
      <header className="page__header">
        <div className="wordmark">
          <span className="wordmark__title">Page Pulse</span>
          <span className="wordmark__subtitle">a quick vitals check for any page</span>
        </div>
      </header>

      <PulseWaveform status={status} />

      <main className="page__main">
        <UrlForm
          url={url}
          onUrlChange={setUrl}
          onSubmit={handleSubmit}
          isLoading={status === "loading"}
        />

        {status === "error" && <ErrorNotice message={errorMessage} />}
        {status === "success" && report && <ReportCard report={report} />}
      </main>

      <footer className="page__footer">
        <span>checks HTTP status, response time, title, meta description, H1s, alt text, and word count</span>
        <a
          className="page__credit"
          href="https://digitalheroesco.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Built for Digital Heroes Training Task
        </a>
      </footer>
    </div>
  );
}

export default App;
