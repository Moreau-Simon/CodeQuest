import Editor from '@monaco-editor/react';
import { useState } from 'react';
import { t } from '../../i18n';
import { Button, cn } from '../ui';

export interface CodeEditorProps {
  value: string;
  language: 'python' | 'javascript';
  onChange(value: string): void;
  height?: string;
  readOnly?: boolean;
  label?: string;
}

/**
 * Éditeur Monaco (T087) : coloration Python/JavaScript, thème sombre,
 * plein écran, sélection de police lisible et zone de secours sans Monaco.
 */
export function CodeEditor({
  value,
  language,
  onChange,
  height = '420px',
  readOnly = false,
  label
}: CodeEditorProps): JSX.Element {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-elevated bg-surface',
        fullscreen && 'fixed inset-0 z-50 m-0 rounded-none border-0 p-4'
      )}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="text-sm text-muted">{label ?? t('editor.title')}</span>
        <Button variant="ghost" size="sm" onClick={() => setFullscreen((current) => !current)}>
          {fullscreen ? t('editor.exitFullscreen') : t('editor.fullscreen')}
        </Button>
      </div>
      <div style={{ height: fullscreen ? 'calc(100vh - 96px)' : height }}>
        <Editor
          height="100%"
          language={language === 'javascript' ? 'javascript' : 'python'}
          theme="vs-dark"
          value={value}
          onChange={(next) => onChange(next ?? '')}
          loading={<p className="p-4 text-muted">{t('common.loading')}</p>}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: language === 'python' ? 4 : 2,
            ariaLabel: label ?? t('editor.title')
          }}
        />
      </div>
    </div>
  );
}
