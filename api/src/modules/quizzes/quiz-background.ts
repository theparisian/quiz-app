export function shapeQuizBackgroundPayload(quiz: {
  backgroundMediaUrl: string | null;
  backgroundMediaType: string | null;
  backgroundOverlayOpacity: number;
}) {
  return {
    backgroundMediaUrl: quiz.backgroundMediaUrl,
    backgroundMediaType: quiz.backgroundMediaType,
    backgroundOverlayOpacity: quiz.backgroundOverlayOpacity,
  };
}
