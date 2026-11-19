import { GameCatalogClient } from './game-catalog-client';

export default async function GameCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GameCatalogClient slug={slug} />;
}
