import { EditTowerClient } from './edit-tower-client';

export default async function EditTowerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditTowerClient slug={slug} />;
}
