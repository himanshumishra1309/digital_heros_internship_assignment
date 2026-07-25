function ErrorNotice({ message }) {
  return (
    <div className="error-notice" role="alert">
      <span className="error-notice__label">No signal</span>
      <p className="error-notice__message">{message}</p>
    </div>
  );
}

export default ErrorNotice;
