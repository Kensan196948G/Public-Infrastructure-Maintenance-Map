import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * 🔄 データ更新 — 表示中の全データ(地図・一覧・サマリ・ソース等)を API から
 * 取り直すヘッダボタン。react-query の全キャッシュを invalidate し、アクティブな
 * クエリの再取得完了を待ってから「最終更新」時刻を表示する。取込(ingest)の
 * 実行ではなく閲覧データの再取得である点に注意(取込は CLI / 管理API の責務)。
 */
export function DataRefreshButton() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      // invalidateQueries はアクティブクエリの refetch 完了で resolve する。
      // 個々の取得エラーは各ビューの既存 error 表示に委ねる(ここでは握らない)。
      await queryClient.invalidateQueries();
      setLastUpdated(
        new Intl.DateTimeFormat('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <span className="data-refresh">
      <button
        type="button"
        className="header-link"
        onClick={() => void handleRefresh()}
        disabled={isRefreshing}
        aria-busy={isRefreshing}
        aria-label="表示データをAPIから取り直す"
      >
        {isRefreshing ? '⏳ 更新中…' : '🔄 データ更新'}
      </button>
      {lastUpdated ? (
        <span className="data-refresh-time" role="status">
          最終更新 {lastUpdated}
        </span>
      ) : null}
    </span>
  );
}
