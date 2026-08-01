export function citySelectionFields(option) {
  return {
    city: String(option?.label || "").trim(),
    city_place_id: option?.created ? "" : String(option?.value || ""),
  };
}

