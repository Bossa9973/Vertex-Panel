interface Props {
    mode?: 'login' | 'register'
    onError?: (err: Error) => void
}

const SocialLoginButtons = ({ mode = 'login' }: Props) => {
    const handleSocialAuth = (provider: 'google' | 'discord') => {
        window.location.href = `/auth/social/${provider}/redirect?mode=${mode}`
    }

    return (
        <div className='my-5'>
            <div className='grid grid-cols-2 gap-3 mb-4'>
                {/* Google OAuth Button */}
                <button
                    type='button'
                    onClick={() => handleSocialAuth('google')}
                    className='flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1c1f24] text-gray-800 dark:text-gray-100 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-[#252930] hover:border-gray-300 dark:hover:border-gray-700 transition active:scale-[0.98] shadow-xs cursor-pointer'
                >
                    <svg className='w-4 h-4 shrink-0' viewBox='0 0 24 24'>
                        <path
                            fill='#4285F4'
                            d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
                        />
                        <path
                            fill='#34A853'
                            d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
                        />
                        <path
                            fill='#FBBC05'
                            d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z'
                        />
                        <path
                            fill='#EA4335'
                            d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z'
                        />
                    </svg>
                    <span>Google</span>
                </button>

                {/* Discord OAuth Button */}
                <button
                    type='button'
                    onClick={() => handleSocialAuth('discord')}
                    className='flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-indigo-500/30 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 text-xs font-semibold transition active:scale-[0.98] shadow-xs cursor-pointer'
                >
                    <svg className='w-4 h-4 shrink-0 fill-current text-indigo-500' viewBox='0 0 127.14 96.36'>
                        <path d='M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14c2.64-27.38-4.51-51.11-18.91-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.92,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.92,96.12,53,91.08,65.69,84.69,65.69Z' />
                    </svg>
                    <span>Discord</span>
                </button>
            </div>

            <div className='relative flex py-2 items-center'>
                <div className='flex-grow border-t border-gray-200 dark:border-gray-800' />
                <span className='flex-shrink mx-3 text-2xs uppercase font-bold text-gray-400 dark:text-gray-500 tracking-wider'>
                    or continue with email
                </span>
                <div className='flex-grow border-t border-gray-200 dark:border-gray-800' />
            </div>
        </div>
    )
}

export default SocialLoginButtons

