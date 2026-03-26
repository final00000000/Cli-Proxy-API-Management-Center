import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AuthFileItem } from '@/types';

type AuthFileDetailModalProps = {
  open: boolean;
  file: AuthFileItem | null;
  onClose: () => void;
  onCopyText: (text: string) => void | Promise<void>;
};

export function AuthFileDetailModal(props: AuthFileDetailModalProps) {
  const { t } = useTranslation();
  const { open, file, onClose, onCopyText } = props;

  const previewText = useMemo(() => {
    if (!file) return '';
    return JSON.stringify(file, null, 2);
  }, [file]);

  return (
    <Modal open={open} onClose={onClose} title={t('auth_files.detail_modal_title', { defaultValue: '认证文件详情' })}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          minWidth: 'min(720px, 82vw)',
          maxWidth: '82vw',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <strong>{file?.name ?? '-'}</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {t('auth_files.detail_modal_hint', {
              defaultValue: '展示当前认证文件的元数据快照，便于排查与复制。',
            })}
          </span>
        </div>

        <pre
          style={{
            margin: 0,
            maxHeight: '55vh',
            overflow: 'auto',
            padding: '14px',
            borderRadius: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {previewText || '{}'}
        </pre>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="secondary" onClick={() => void onCopyText(previewText || '{}')}>
            {t('common.copy', { defaultValue: '复制' })}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('common.close', { defaultValue: '关闭' })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
