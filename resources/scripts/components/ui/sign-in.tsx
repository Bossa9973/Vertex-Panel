import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import DiscordSvgIcon from '@/components/elements/DiscordSvgIcon';

// --- HELPER COMPONENTS (ICONS) ---

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
);

// --- TYPE DEFINITIONS ---

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onDiscordSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
  loading?: boolean;
  error?: string;
}

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-stone-700/60 bg-stone-900/60 backdrop-blur-sm transition-colors focus-within:border-blue-500/70 focus-within:bg-blue-500/10">
    {children}
  </div>
);

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial, delay: string }) => (
  <div className={`animate-element ${delay} flex items-center gap-3 p-4 rounded-2xl bg-stone-900/80 backdrop-blur-md border border-stone-800 max-w-xs shadow-lg`}>
    <img src={testimonial.avatarSrc} alt={testimonial.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
    <div className="overflow-hidden">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-xs text-white truncate">{testimonial.name}</span>
        <span className="text-[10px] text-stone-400 truncate">{testimonial.handle}</span>
      </div>
      <p className="text-[11px] text-stone-300 mt-1 line-clamp-2 leading-tight">{testimonial.text}</p>
    </div>
  </div>
);

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light text-white tracking-tighter">Sign in</span>,
  description = "Access your account and manage your services.",
  heroImageSrc,
  testimonials = [],
  onSignIn,
  onGoogleSignIn,
  onDiscordSignIn,
  onResetPassword,
  onCreateAccount,
  loading = false,
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0c0d0e] font-sans">
      {/* Left column: form */}
      <section className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 z-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <div>
              <div className="animate-element flex items-center gap-2 mb-8">
                <span className="font-bold text-white tracking-tight text-xl">Vertex</span>
              </div>
              <h1 className="animate-element animate-delay-100 text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">{title}</h1>
              <p className="animate-element animate-delay-200 text-stone-400 text-sm">{description}</p>
            </div>

            {error && (
              <div className="animate-element p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form className="space-y-4" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-300">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Email Address</label>
                <GlassInputWrapper>
                  <input required name="email" type="email" placeholder="Enter your email address" className="w-full bg-transparent text-sm p-4 text-white rounded-2xl focus:outline-none placeholder-stone-500" />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5 block">Password</label>
                <GlassInputWrapper>
                  <div className="relative flex items-center">
                    <input required name="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" className="w-full bg-transparent text-sm p-4 pr-12 text-white rounded-2xl focus:outline-none placeholder-stone-500 [::-ms-reveal]:hidden [::-ms-clear]:hidden" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 p-2 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 transition-all flex items-center justify-center">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-500 flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-stone-300">
                  <input type="checkbox" name="rememberMe" className="rounded border-stone-700 bg-stone-900 text-blue-500 focus:ring-blue-500/30" />
                  <span>Keep me signed in</span>
                </label>
                {onResetPassword && (
                  <a href="#" onClick={(e) => { e.preventDefault(); onResetPassword?.(); }} className="hover:underline text-blue-400 font-medium transition-colors">Reset password</a>
                )}
              </div>

              <button disabled={loading} type="submit" className="animate-element animate-delay-600 w-full rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold py-4 text-sm shadow-lg shadow-blue-600/20 active:scale-[0.99] transition-all disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="animate-element animate-delay-700 relative flex items-center justify-center my-2">
              <span className="w-full border-t border-stone-800"></span>
              <span className="px-4 text-xs text-stone-500 bg-[#0c0d0e] absolute">Or continue with</span>
            </div>

            <div className="animate-element animate-delay-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {onGoogleSignIn && (
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2.5 border border-stone-800 hover:border-stone-700 bg-stone-900/50 rounded-2xl py-3 px-4 text-xs font-semibold text-white hover:bg-stone-800/50 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <GoogleIcon />
                  <span>Google</span>
                </button>
              )}
              {onDiscordSignIn && (
                <button
                  type="button"
                  onClick={onDiscordSignIn}
                  className="w-full flex items-center justify-center gap-2.5 border border-indigo-500/30 hover:border-indigo-500/50 bg-indigo-600/10 hover:bg-indigo-600/20 rounded-2xl py-3 px-4 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer shadow-xs active:scale-[0.98]"
                >
                  <DiscordSvgIcon className="w-4 h-4 fill-current text-[#5865F2]" />
                  <span>Discord</span>
                </button>
              )}
            </div>

            <p className="animate-element animate-delay-900 text-center text-xs text-stone-400 mt-2">
              New to Vertex? <a href="#" onClick={(e) => { e.preventDefault(); onCreateAccount?.(); }} className="text-blue-400 font-semibold hover:underline transition-colors">Create Account</a>
            </p>
          </div>
        </div>
      </section>

      {/* Right column: hero image + testimonials */}
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center shadow-2xl border border-stone-800/50" style={{ backgroundImage: `url(${heroImageSrc})` }}>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
          </div>
          {testimonials && testimonials.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center z-10">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
              {testimonials[2] && <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
