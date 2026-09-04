export function statusBadgeClasses(status) {
  switch (status) {
    case "Expired":
      return "bg-red-50 text-red-700 border-red-200";
    case "Expiring Soon":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "Active":
      return "bg-green-50 text-green-700 border-green-200";
    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export function analysisStatusLabel(status) {
  switch (status) {
    case "pending":
      return "Not analyzed yet";
    case "analyzing":
      return "Analyzing…";
    case "done":
      return "Analyzed";
    case "unavailable":
      return "AI analysis unavailable";
    case "failed":
      return "Analysis failed";
    default:
      return status || "";
  }
}
