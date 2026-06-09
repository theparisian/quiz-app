export function shapeQuizBackgroundPayload(quiz: {
  backgroundMediaUrl: string | null;
  backgroundMediaType: string | null;
  backgroundOverlayOpacity: number;
  brandingJson?: unknown;
}) {
  return {
    backgroundMediaUrl: quiz.backgroundMediaUrl,
    backgroundMediaType: quiz.backgroundMediaType,
    backgroundOverlayOpacity: quiz.backgroundOverlayOpacity,
    brandingJson: quiz.brandingJson ?? null,
  };
}
