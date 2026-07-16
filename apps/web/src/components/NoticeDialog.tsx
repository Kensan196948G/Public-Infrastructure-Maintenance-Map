import { Modal } from './Modal.js';
import { DISCLAIMER_TEXT } from './DisclaimerBanner.js';

interface NoticeDialogProps {
  onClose: () => void;
}

/** 利用上の注意 (UI-04): purpose, limits and how to use the data responsibly. */
export function NoticeDialog({ onClose }: NoticeDialogProps) {
  return (
    <Modal title="利用上の注意" onClose={onClose}>
      <p className="notice-lead">{DISCLAIMER_TEXT}</p>
      <ul className="notice-list">
        <li>
          本サービスは公開情報を集約した<strong>参考情報</strong>であり、構造物の健全性・安全性・
          通行可否などを判定するものではありません。
        </li>
        <li>
          表示内容は原典の更新時点の情報です。
          <strong>最新かつ正式な情報は、必ず原典と管理主体へ</strong>
          確認してください。
        </li>
        <li>
          欠損している値は推測せず「不明」と表示します。位置・名称・属性の正確性は保証されません。
        </li>
        <li>
          各データの提供元・ライセンス・更新状況は「データソース一覧」で確認できます。
          再配布の可否はライセンスに従ってください。
        </li>
        <li>会社資産・社内情報は含まれません。公開情報のみを対象としています。</li>
      </ul>
    </Modal>
  );
}
