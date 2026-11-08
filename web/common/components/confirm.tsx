import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app.tsx';
import { Button, Dialog } from './ui.tsx';

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useApp();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        title={options?.title ?? ''}
        onClose={() => close(false)}
        footer={
          <>
            <Button onClick={() => close(false)}>{t.common.cancel}</Button>
            <Button variant={options?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {options?.confirmLabel ?? t.common.done}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[15px]">{options?.message}</p>
      </Dialog>
    </ConfirmContext.Provider>
  );
}
