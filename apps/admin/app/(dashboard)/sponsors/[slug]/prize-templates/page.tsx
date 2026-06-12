'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../../lib/api';

interface PrizeTemplate {
  id: string;
  label: string;
  type: string;
  stockLabel: string;
  stock: number | null;
  isActive: boolean;
}

export default function SponsorPrizeTemplatesPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<'discount_qr' | 'video' | 'other'>('discount_qr');
  const [stock, setStock] = useState('');

  const q = useQuery({
    queryKey: ['sponsor-prize-templates', slug],
    queryFn: () => api.get<{ items: PrizeTemplate[] }>(`/api/sponsors/${slug}/prize-templates`),
    enabled: !!slug,
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/sponsors/${slug}/prize-templates`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sponsor-prize-templates', slug] });
      setShowForm(false);
      setLabel('');
      setStock('');
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/prize-templates/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor-prize-templates', slug] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/sponsors/${slug}`} className="text-sm text-blue-600 hover:underline">
        ← Sponsor
      </Link>
      <h1 className="text-2xl font-bold">Catalogue de lots sponsor</h1>

      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white"
      >
        Nouveau lot
      </button>

      {showForm && (
        <div className="rounded border bg-gray-50 p-4">
          <input
            className="mb-2 w-full rounded border px-3 py-2"
            placeholder="Libellé"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <select
            className="mb-2 w-full rounded border px-3 py-2"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="discount_qr">Code QR</option>
            <option value="video">Vidéo</option>
            <option value="other">Autre</option>
          </select>
          <input
            type="number"
            className="mb-2 w-full rounded border px-3 py-2"
            placeholder="Stock (vide = illimité)"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white"
            onClick={() =>
              createMut.mutate({
                label: label.trim(),
                type,
                ...(stock.trim() ? { stock: parseInt(stock, 10) } : { stock: null }),
              })
            }
          >
            Créer
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="py-2 text-left">Lot</th>
            <th>Stock</th>
            <th>Statut</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {q.data?.items.map((t) => (
            <tr key={t.id} className="border-b">
              <td className="py-2">{t.label}</td>
              <td>{t.stockLabel}</td>
              <td>{t.isActive ? 'Actif' : 'Archivé'}</td>
              <td>
                {t.isActive && (
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => archiveMut.mutate(t.id)}
                  >
                    Archiver
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
