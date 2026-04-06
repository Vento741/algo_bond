import { useState, useCallback } from 'react';
import { Key, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FadeUp } from '@/components/landing/FadeUp';
import api from '@/lib/api';
import { trackConversion } from '@/lib/tracker';

const TG_REGEX = /^@[a-zA-Z0-9_-]{4,31}$/;
const LS_KEY = 'access_request_sent';

function validateTelegram(value: string): string {
  if (!value) return 'Введите ваш Telegram username';
  if (!value.startsWith('@')) return 'Username должен начинаться с @';
  if (!TG_REGEX.test(value))
    return 'Формат: @username (5-32 символа, латиница, цифры, _, -)';
  return '';
}

export function AccessRequestForm() {
  const [telegram, setTelegram] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(() => localStorage.getItem(LS_KEY) === '1');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const validationError = validateTelegram(telegram);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError('');
      setLoading(true);

      try {
        await api.post('/auth/access-request', { telegram });
        localStorage.setItem(LS_KEY, '1');
        setSent(true);
        trackConversion('access_request', { telegram });
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 409) {
          localStorage.setItem(LS_KEY, '1');
          setSent(true);
        } else if (axiosErr.response?.status === 429) {
          setError('Слишком много попыток. Повторите позже.');
        } else {
          setError('Ошибка отправки. Попробуйте позже.');
        }
      } finally {
        setLoading(false);
      }
    },
    [telegram],
  );

  return (
    <section
      id="access-request"
      className="relative z-10 px-5 lg:px-10 py-20 lg:py-[120px] text-center"
    >
      <FadeUp>
        <div
          className="relative max-w-[520px] mx-auto rounded-[20px] bg-white/[0.02] border border-brand-premium/[0.12] p-8 sm:p-14"
        >
          {/* Subtle gold glow behind card */}
          <div
            className="absolute inset-[-1px] rounded-[20px] -z-10"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,215,0,0.15), transparent 50%)',
            }}
          />

          {sent ? (
            /* Success state */
            <div className="flex flex-col items-center gap-4">
              <CheckCircle className="h-12 w-12 text-brand-profit" />
              <h2 className="font-heading text-2xl font-bold text-white">
                Заявка отправлена!
              </h2>
              <p className="text-[15px] text-gray-400">
                Мы свяжемся с вами в Telegram и отправим&nbsp;инвайт-код.
              </p>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="flex items-center justify-center gap-3 mb-3">
                <Key className="h-5 w-5 text-brand-premium" />
                <h2 className="font-heading text-[28px] font-bold text-white tracking-tight">
                  Запросите доступ
                </h2>
              </div>
              <p className="text-[15px] text-gray-400 mb-9">
                Оставьте ваш Telegram - мы отправим персональный&nbsp;инвайт-код
              </p>

              <form onSubmit={handleSubmit} data-track-form="access_request">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <input
                    type="text"
                    value={telegram}
                    onChange={(e) => {
                      setTelegram(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="@username"
                    className="flex-1 h-12 px-5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-white text-[15px] placeholder:text-gray-600 outline-none transition-colors focus:border-brand-premium/40"
                  />
                  <Button
                    type="submit"
                    variant="premium"
                    disabled={loading}
                    className="h-12 px-8 rounded-xl text-[15px] font-semibold whitespace-nowrap"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Отправить'
                    )}
                  </Button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 justify-center text-brand-loss text-sm mb-4">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                  </div>
                )}
              </form>

              <p className="text-xs text-gray-600">
                Нажимая &laquo;Отправить&raquo;, вы соглашаетесь с{' '}
                <a
                  href="/terms"
                  className="text-gray-500 underline underline-offset-2 hover:text-gray-400 transition-colors"
                >
                  Условиями использования
                </a>
              </p>
            </>
          )}
        </div>
      </FadeUp>
    </section>
  );
}
