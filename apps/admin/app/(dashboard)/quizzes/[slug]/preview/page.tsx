import { QuizPreviewClient } from './quiz-preview-client';

export default async function QuizPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <QuizPreviewClient slug={slug} />;
}
