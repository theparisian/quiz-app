import { QuizEditClient } from './quiz-edit-client';

export default async function QuizEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <QuizEditClient slug={slug} />;
}
