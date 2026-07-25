function UrlForm({ url, onUrlChange, onSubmit, isLoading }) {
  return (
    <form className="url-form" onSubmit={onSubmit}>
      <label className="url-form__label" htmlFor="url-input">
        Page to check
      </label>
      <div className="url-form__row">
        <input
          id="url-input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck="false"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || url.trim().length === 0}>
          {isLoading ? "Checking\u2026" : "Check pulse"}
        </button>
      </div>
    </form>
  );
}

export default UrlForm;
