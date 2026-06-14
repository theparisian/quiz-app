export function shapeQuizBackgroundPayload(quiz: {
  backgroundMediaUrl: string | null;
  backgroundMediaType: string | null;
  backgroundOverlayOpacity: number;
  lobbyBackgroundMediaUrl: string | null;
  lobbyBackgroundMediaType: string | null;
  lobbyBackgroundOverlayOpacity: number;
  brandingJson?: unknown;
}) {
  return {
    backgroundMediaUrl: quiz.backgroundMediaUrl,
    backgroundMediaType: quiz.backgroundMediaType,
    backgroundOverlayOpacity: quiz.backgroundOverlayOpacity,
    lobbyBackgroundMediaUrl: quiz.lobbyBackgroundMediaUrl,
    lobbyBackgroundMediaType: quiz.lobbyBackgroundMediaType,
    lobbyBackgroundOverlayOpacity: quiz.lobbyBackgroundOverlayOpacity,
    brandingJson: quiz.brandingJson ?? null,
  };
}
