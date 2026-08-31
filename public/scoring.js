function looksLikePerformance(value) {
  return /\d/.test(value) && /['’":hHmM\.,]/.test(value);
}

function cleanPerformance(value) {
  return String(value)
    .replace(/\(.*?\)/g, "")
    .trim();
}

export function perfToComparable(performance) {
  if (!performance) return null;

  let value = cleanPerformance(performance);
  if (!value) return null;

  value = value.replace(/\u00a0/g, " ").trim();

  let match = value.match(/^(\d+)\s*m\s*(\d{1,2})$/i);
  if (match) {
    const meters = Number(match[1]);
    const centimeters = Number(match[2]);
    if (Number.isFinite(meters) && Number.isFinite(centimeters)) {
      return { type: "dist", value: meters + centimeters / 100 };
    }
  }

  match = value.match(/^(\d+)[,.](\d{1,2})$/);
  if (match) {
    const meters = Number(match[1]);
    const centimeters = Number(match[2]);
    if (Number.isFinite(meters) && Number.isFinite(centimeters)) {
      return { type: "dist", value: meters + centimeters / 100 };
    }
  }

  match = value.match(/^(\d+)\s*m$/i);
  if (match) {
    const meters = Number(match[1]);
    if (Number.isFinite(meters)) {
      return { type: "dist", value: meters };
    }
  }

  if (value.includes(":")) {
    const parts = value.split(":").map((part) => part.trim());
    let secondsPart = parts.pop();
    let fraction = 0;

    if (secondsPart.includes(".")) {
      const [secondsText, fractionText] = secondsPart.split(".");
      secondsPart = secondsText;
      fraction = Number(`0.${fractionText}`);
    }

    const seconds = Number(secondsPart);
    if (!Number.isFinite(seconds)) return null;

    let total = seconds + fraction;
    let multiplier = 60;

    while (parts.length) {
      const part = Number(parts.pop());
      if (!Number.isFinite(part)) return null;
      total += part * multiplier;
      multiplier *= 60;
    }

    return { type: "time", value: total };
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let hundredths = 0;

  const hoursMatch = value.match(/(\d+)\s*h/i);
  if (hoursMatch) hours = Number(hoursMatch[1]);

  const minutesMatch = value.match(/(\d+)\s*'(?!')/);
  if (minutesMatch) minutes = Number(minutesMatch[1]);

  const secondsMatch = value.match(/(\d+)\s*''\s*(\d+)?/);
  if (secondsMatch) {
    seconds = Number(secondsMatch[1]);
    hundredths = secondsMatch[2] ? Number(secondsMatch[2]) : 0;
  } else {
    const numericMatch = value.match(/^\d+([.,]\d+)?$/);
    if (numericMatch) {
      return { type: "time", value: Number(value.replace(",", ".")) };
    }
    if (!looksLikePerformance(value)) return null;
  }

  if (![hours, minutes, seconds, hundredths].every(Number.isFinite)) {
    return null;
  }

  const total =
    hours * 3600 +
    minutes * 60 +
    seconds +
    (hundredths ? hundredths / 100 : 0);

  if (!Number.isFinite(total) || total === 0) return null;
  return { type: "time", value: total };
}

export function pointsResultFromTable(table, performance, mode = "50") {
  const normalizedMode = mode === "1000" ? "1000" : "50";
  if (!performance) {
    return { points: null, status: "empty", mode: normalizedMode };
  }

  if (!table || !Array.isArray(table.thresholds)) {
    return { points: null, status: "unavailable", mode: normalizedMode };
  }

  const parsed = perfToComparable(performance);
  if (!parsed || parsed.type !== table.type) {
    return { points: null, status: "invalid", mode: normalizedMode };
  }

  let bestPoints = null;
  for (const entry of table.thresholds) {
    if (!Number.isFinite(entry?.points) || !Number.isFinite(entry?.value)) {
      continue;
    }

    const qualifies = table.type === "time"
      ? parsed.value <= entry.value
      : parsed.value >= entry.value;

    if (qualifies && (bestPoints == null || entry.points > bestPoints)) {
      bestPoints = entry.points;
    }
  }

  return {
    points: bestPoints,
    status: bestPoints == null ? "out-of-range" : "ok",
    mode: normalizedMode,
  };
}

export function pointsPresentation(result) {
  if (Number.isFinite(result?.points)) {
    return {
      label: String(result.points),
      className: "has-points",
      title: `${result.points} point${result.points > 1 ? "s" : ""}`,
    };
  }

  if (result?.status === "unavailable") {
    return {
      label: "N/D",
      className: "points-unavailable",
      title: `Barème ${result.mode} indisponible pour cette épreuve, cette catégorie ou ce sexe.`,
    };
  }

  if (result?.status === "invalid") {
    return {
      label: "?",
      className: "points-invalid",
      title: "La performance n'a pas pu être convertie en points.",
    };
  }

  if (result?.status === "out-of-range") {
    return {
      label: "0",
      className: "no-points",
      title: "Performance située sous le premier seuil du barème.",
    };
  }

  return { label: "—", className: "no-points", title: "Aucune performance." };
}
