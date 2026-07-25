const UNIT = "M0,60 L210,60 L226,22 L242,98 L258,32 L274,66 L290,54 L306,60 L600,60";

/**
 * status: "idle" | "loading" | "success" | "error"
 * Same waveform shape throughout — only color and speed change,
 * so it always reads as the same signal, just in a different state.
 */
function PulseWaveform({ status = "idle" }) {
  return (
    <div className={`pulse-wrap pulse-wrap--${status}`} aria-hidden="true">
      <svg
        className="pulse-track"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <path d={UNIT} className="pulse-path" />
        <path d={UNIT} className="pulse-path" transform="translate(600, 0)" />
      </svg>
    </div>
  );
}

export default PulseWaveform;
