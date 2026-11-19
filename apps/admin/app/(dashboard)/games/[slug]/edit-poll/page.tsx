import { EditPollClient } from './edit-poll-client';

export default async function EditPollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditPollClient slug={slug} />;
}
