'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { usePlayerStore } from '@/lib/stores/player-store';
import AnswerButton from './answer-button';

interface QuestionScreenProps {
  socket: Socket | null;
}

const POSITIONS = ['A', 'B', 'C', 'D'] as const;

export default function QuestionScreen({ socket }: QuestionScreenProps) {
  const currentQuestionPosition = usePlayerStore((s) => s.currentQuestionPosition);
  const totalQuestions = usePlayerStore((s) => s.totalQuestions);
  const currentQuestionId = usePlayerStore((s) => s.currentQuestionId);
  const questionStartedAt = usePlayerStore((s) => s.questionStartedAt);
  const questionTimeLimitMs = usePlayerStore((s) => s.questionTimeLimitMs);
  const answerMap = usePlayerStore((s) => s.answerMap);
  const selectAnswer = usePlayerStore((s) => s.selectAnswer);

  const [remainingSec, setRemainingSec] = useState(Math.ceil(questionTimeLimitMs / 1000));
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!questionStartedAt) return;
    function tick() {
      const elapsed = Date.now() - (questionStartedAt ?? Date.now());
      const remaining = Math.max(0, questionTimeLimitMs - elapsed);
      setRemainingSec(Math.ceil(remaining / 1000));
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [questionStartedAt, questionTimeLimitMs]);

  function handleTap(position: (typeof POSITIONS)[number]) {
    if (!socket || !currentQuestionId) return;
    const answerId = answerMap[position];
    if (!answerId) return;

    socket.emit('player:submit_answer', {
      questionId: currentQuestionId,
      answerId,
    });

    selectAnswer(answerId, position);
  }

  return (
    <div className="flex flex-1 flex-col px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg font-bold tabular-nums">⏱ {remainingSec}s</span>
        <span className="text-sm text-gray-400">
          Question {currentQuestionPosition}/{totalQuestions}
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3">
        {POSITIONS.map((pos) => (
          <AnswerButton key={pos} position={pos} onTap={() => handleTap(pos)} />
        ))}
      </div>
    </div>
  );
}
