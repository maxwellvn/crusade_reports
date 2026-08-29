export function formatWholeNumberInput(value) {
  const digits = String(value ?? "").replace(/,/g, "");
  if (!/^\d*$/.test(digits)) return null;
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function parseWholeNumberInput(value) {
  const formatted = formatWholeNumberInput(value);
  if (formatted == null || formatted === "") return null;
  const parsed = Number(formatted.replaceAll(",", ""));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
