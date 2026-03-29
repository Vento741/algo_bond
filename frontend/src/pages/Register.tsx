import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrendingUp, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [success, setSuccess] = useState(false);
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await register(email, username, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      // error is set in store
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-brand-premium/3 blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand-premium/10 transition-colors group-hover:bg-brand-premium/20">
              <TrendingUp className="h-5 w-5 text-brand-premium" />
            </div>
            <span className="text-2xl font-bold text-white">AlgoBond</span>
          </Link>
        </div>

        {/* Card */}
        <Card className="border-white/5 bg-white/[0.03] backdrop-blur-xl shadow-2xl">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-white">Регистрация</CardTitle>
            <CardDescription>
              Создайте аккаунт для доступа к торговой платформе
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-12 w-12 text-brand-profit" />
                <p className="text-white font-medium">Регистрация успешна!</p>
                <p className="text-gray-400 text-sm">
                  Перенаправляем на страницу входа...
                </p>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-loss/10 border border-brand-loss/20 text-brand-loss text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-gray-300">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError();
                      }}
                      required
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username" className="text-gray-300">
                      Имя пользователя
                    </Label>
                    <Input
                      id="username"
                      type="text"
                      placeholder="trader_name"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearError();
                      }}
                      required
                      minLength={2}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-gray-300">
                      Пароль
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Минимум 8 символов"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError();
                      }}
                      required
                      minLength={8}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-brand-premium/50"
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="premium"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Регистрация...
                      </>
                    ) : (
                      'Создать аккаунт'
                    )}
                  </Button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-400">
                  Уже есть аккаунт?{' '}
                  <Link
                    to="/login"
                    className="text-brand-premium hover:underline font-medium"
                  >
                    Войти
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
