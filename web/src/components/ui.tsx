import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X, Inbox, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/* ---------- Toasts ---------- */
interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}
const ToastCtx = createContext<(type: Toast['type'], message: string) => void>(() => {});
let toastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((type: Toast['type'], message: string) => {
    const id = toastId++;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={18} /> : t.type === 'error' || t.type === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/* ---------- Modal ---------- */
export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'lg' | 'xl' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Form helpers ---------- */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info' | 'primary' | 'neutral' }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Empty({ text, icon }: { text: string; icon?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon ?? <Inbox size={34} />}</div>
      <div>{text}</div>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading-center">
      <span className="spinner" />
    </div>
  );
}

export function Stat({ label, value, sub, icon, color }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; color: string }) {
  return (
    <div className="card stat">
      <div className="icon" style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

export function Confirm({ title, message, onConfirm, onCancel, danger }: { title: string; message: ReactNode; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>Confirmar</button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export function CopyButton({ text }: { text: string }) {
  const toast = useToast();
  return (
    <button
      className="btn sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => toast('success', 'Copiado!')).catch(() => toast('error', 'Não foi possível copiar'));
      }}
    >
      Copiar
    </button>
  );
}
