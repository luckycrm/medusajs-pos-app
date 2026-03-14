import { useState } from 'react';
import { Github } from 'lucide-react';
import { sdk } from '../lib/medusa';

interface LoginFormData {
  email: string;
  password: string;
}

interface LoginProps {
  onSuccess: (user: { email: string; firstName?: string; lastName?: string }) => void;
  storeLogo: string;
}

export default function Login({ onSuccess, storeLogo }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const loginResponse = await sdk.auth.login('user', 'emailpass', {
        email,
        password,
      });

      if (typeof loginResponse !== 'string') {
        throw new Error('Unexpected response format');
      }

      const token = loginResponse;
      localStorage.setItem('medusa_auth_token', token);

      const { user } = await sdk.auth.getCurrentUser();

      onSuccess({
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      });
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(err?.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <a
        href="https://github.com/luckycrm"
        target="_blank"
        rel="noopener noreferrer"
        className="github-link"
        aria-label="GitHub Repository"
      >
        <Github size={24} />
      </a>
      <div className="login-container">
        <div className="login-logo">
          <img className="login-logo-image" src={storeLogo} alt="POS Login" width={192} height={63} />
        </div>
        
        <h1 className="login-title">Login</h1>
        
        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              required
              disabled={isLoading}
              autoComplete="email"
              aria-label="Email Address"
            />
          </div>

          <div className="login-field">
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              disabled={isLoading}
              autoComplete="current-password"
              aria-label="Password"
            />
          </div>

          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
